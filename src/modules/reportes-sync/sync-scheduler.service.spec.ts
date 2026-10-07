import { SyncSchedulerService } from './sync-scheduler.service';
import { SyncLockService } from './utils/sync-lock.service';

function build(env: Record<string, unknown> = {}) {
  const orchestrator = {
    syncEntidadForAllActive: jest.fn(async () => ({ rowsSynced: 3, failed: 0 })),
  };
  const config = { get: jest.fn((k: string) => env[k]) };
  const service = new SyncSchedulerService(config as never, orchestrator as never);
  return { service, orchestrator };
}

describe('SyncSchedulerService', () => {
  const ahora = new Date('2026-10-05T15:30:00Z');

  it('lanza 3 pasadas de recibos (vigencia, cobrados, anulados) con ventana de 7 días y 1 de siniestros', async () => {
    const { service, orchestrator } = build();
    await service.runOnce(ahora);

    const calls = orchestrator.syncEntidadForAllActive.mock.calls as unknown as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ][];
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c[0])).toEqual(['recibos', 'recibos', 'recibos', 'siniestros']);
    expect(calls.slice(0, 3).map((c) => c[1].estado)).toEqual([undefined, 'C', 'A']);
    // siniestros: reemplazo completo, sin rango de fechas
    expect(calls[3][1]).toEqual({});
    expect(calls[3][2]).toEqual({ ignoreTtl: true });
    for (const [entidad, filtros, options] of calls.slice(0, 3)) {
      expect(entidad).toBe('recibos');
      expect(filtros.refreshScope).toBe(true);
      expect((filtros.hasta as Date).toISOString()).toBe('2026-10-05T00:00:00.000Z');
      expect((filtros.desde as Date).toISOString()).toBe('2026-09-28T00:00:00.000Z');
      expect(options).toEqual({ ignoreTtl: true });
    }
  });

  it('respeta REPORTES_SYNC_SCHEDULE_WINDOW_DAYS y lo acota a 60', async () => {
    const { service, orchestrator } = build({ REPORTES_SYNC_SCHEDULE_WINDOW_DAYS: 999 });
    await service.runOnce(ahora);
    const filtros = (orchestrator.syncEntidadForAllActive.mock.calls[0] as unknown[])[1] as {
      desde: Date;
    };
    expect(filtros.desde.toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });

  it('una pasada fallida no impide las siguientes', async () => {
    const { service, orchestrator } = build();
    orchestrator.syncEntidadForAllActive.mockRejectedValueOnce(new Error('origen caído'));
    await service.runOnce(ahora);
    expect(orchestrator.syncEntidadForAllActive).toHaveBeenCalledTimes(4);
  });

  it('REPORTES_SYNC_SCHEDULE_ENTIDADES limita qué entidades refresca', async () => {
    const soloRecibos = build({ REPORTES_SYNC_SCHEDULE_ENTIDADES: 'recibos' });
    await soloRecibos.service.runOnce(ahora);
    expect(soloRecibos.orchestrator.syncEntidadForAllActive).toHaveBeenCalledTimes(3);

    const soloSiniestros = build({ REPORTES_SYNC_SCHEDULE_ENTIDADES: 'siniestros' });
    await soloSiniestros.service.runOnce(ahora);
    const calls = soloSiniestros.orchestrator.syncEntidadForAllActive.mock.calls as unknown as [string][];
    expect(calls.map((c) => c[0])).toEqual(['siniestros']);
  });

  it('un valor inválido en ENTIDADES vuelve a recibos (no deja el refresco vacío)', async () => {
    const { service, orchestrator } = build({ REPORTES_SYNC_SCHEDULE_ENTIDADES: 'polizas, xx' });
    await service.runOnce(ahora);
    expect(orchestrator.syncEntidadForAllActive).toHaveBeenCalledTimes(3);
  });

  it('no solapa rondas', async () => {
    const { service, orchestrator } = build();
    let liberar: () => void = () => undefined;
    orchestrator.syncEntidadForAllActive.mockImplementationOnce(
      () => new Promise((r) => { liberar = () => r({ rowsSynced: 0, failed: 0 }); }),
    );
    const primera = service.runOnce(ahora);
    await service.runOnce(ahora); // se omite
    expect(orchestrator.syncEntidadForAllActive).toHaveBeenCalledTimes(1);
    liberar();
    await primera;
  });

  it('no arranca el temporizador si está desactivado', () => {
    const { service } = build({ REPORTES_SYNC_ENABLED: 'true' });
    service.onModuleInit();
    expect((service as unknown as { timer: unknown }).timer).toBeNull();
  });

  it('arranca el temporizador solo con ambos flags activos y lo detiene al cerrar', () => {
    const { service } = build({
      REPORTES_SYNC_ENABLED: 'true',
      REPORTES_SYNC_SCHEDULE_ENABLED: 'true',
    });
    service.onModuleInit();
    expect((service as unknown as { timer: unknown }).timer).not.toBeNull();
    service.onModuleDestroy();
    expect((service as unknown as { timer: unknown }).timer).toBeNull();
  });
});

describe('SyncLockService', () => {
  it('retiene la conexión del lock y la libera con la misma', async () => {
    const release = jest.fn(async () => undefined);
    const pg = { tryAdvisoryLock: jest.fn(async () => release) };
    const lock = new SyncLockService(pg as never);

    expect(await lock.tryAcquire(1, 'recibos')).toBe(true);
    expect(pg.tryAdvisoryLock).toHaveBeenCalledWith(1002);
    expect(await lock.tryAcquire(1, 'recibos')).toBe(false); // ya retenido localmente
    await lock.release(1, 'recibos');
    expect(release).toHaveBeenCalledTimes(1);
    await lock.release(1, 'recibos'); // idempotente
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('devuelve false si otro proceso tiene el lock', async () => {
    const pg = { tryAdvisoryLock: jest.fn(async () => null) };
    const lock = new SyncLockService(pg as never);
    expect(await lock.tryAcquire(1, 'recibos')).toBe(false);
    await lock.release(1, 'recibos'); // sin efecto
  });
});
