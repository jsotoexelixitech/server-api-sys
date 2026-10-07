import { SyncContextService } from './sync-context.service';

function build(env: Record<string, unknown>) {
  const config = { get: jest.fn((k: string, d?: unknown) => (k in env ? env[k] : d)) };
  const syncService = { syncIncremental: jest.fn(async () => ({ rowsSynced: 5, skipped: false })) };
  const aseguradoraResolver = {
    resolveAseguradoraId: jest.fn(async () => 1),
    aseguradoraRequiredMessage: jest.fn(() => 'aseguradora requerida'),
  };
  const insurerConnection = { listActiveConnectionsSafe: jest.fn(async () => []) };
  const service = new SyncContextService(
    config as never,
    insurerConnection as never,
    aseguradoraResolver as never,
    syncService as never,
  );
  return { service, syncService };
}

const body = { filtros: { desde: '2026-01-01', hasta: '2026-01-31' } };

describe('SyncContextService · sync al consultar recibos', () => {
  it('por defecto la consulta de recibos sincroniza (comportamiento previo)', async () => {
    const { service, syncService } = build({ REPORTES_SYNC_ENABLED: true });
    await service.maybeSyncBeforeReport('recibos', body);
    expect(syncService.syncIncremental).toHaveBeenCalledTimes(1);
  });

  it('con REPORTES_SYNC_RECIBOS_ON_EXECUTE=false no sincroniza y lo informa', async () => {
    const { service, syncService } = build({
      REPORTES_SYNC_ENABLED: true,
      REPORTES_SYNC_RECIBOS_ON_EXECUTE: false,
    });
    const result = (await service.maybeSyncBeforeReport('recibos', body)) as {
      skipped: boolean;
      reason: string;
    };
    expect(syncService.syncIncremental).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('refresco programado');
  });

  it('forceSync sigue sincronizando aunque la consulta tenga el sync desactivado', async () => {
    const { service, syncService } = build({
      REPORTES_SYNC_ENABLED: true,
      REPORTES_SYNC_RECIBOS_ON_EXECUTE: false,
    });
    await service.maybeSyncBeforeReport('recibos', { ...body, forceSync: true });
    expect(syncService.syncIncremental).toHaveBeenCalledTimes(1);
  });

  it('solo afecta a recibos: siniestros y pólizas siguen sincronizando al consultar', async () => {
    const { service, syncService } = build({
      REPORTES_SYNC_ENABLED: true,
      REPORTES_SYNC_RECIBOS_ON_EXECUTE: false,
    });
    await service.maybeSyncBeforeReport('siniestros', body);
    await service.maybeSyncBeforeReport('polizas', body);
    expect(syncService.syncIncremental).toHaveBeenCalledTimes(2);
  });

  it('con el sync general apagado no sincroniza nada', async () => {
    const { service, syncService } = build({ REPORTES_SYNC_ENABLED: false });
    await service.maybeSyncBeforeReport('recibos', body);
    expect(syncService.syncIncremental).not.toHaveBeenCalled();
  });
});
