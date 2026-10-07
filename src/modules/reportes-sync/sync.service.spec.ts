import { SyncService } from './sync.service';

type Env = Record<string, unknown>;

const FILAS = [
  { origenClave: 'R-1', poliza: 'P1', idEstatus: 3 },
  { origenClave: 'R-2', poliza: 'P2', idEstatus: 3 },
  { origenClave: 'R-3', poliza: 'P3', idEstatus: 2 },
];

function build(
  env: Env = {},
  opts: {
    filas?: Record<string, unknown>[];
    huerfanas?: number;
    changed?: number;
    filterParams?: Record<string, unknown>;
  } = {},
) {
  const cfg: Env = { REPORTES_SYNC_ENABLED: true, ...env };
  const config = { get: jest.fn((k: string, d?: unknown) => (k in cfg ? cfg[k] : d)) };

  const originConfig = {
    mode: 'query',
    querySql: 'SELECT * FROM adrecibos rec WHERE rec.fdesde >= @desde /*SYNC_DATE_COL*/',
    dateColByTipoFecha: { default: 'rec.fdesde' },
    filterParams: opts.filterParams ?? {},
  };
  const adapter = {
    planEntityExtraction: jest.fn(() => ({ source: 'db', query: 'SELECT 1', params: {}, originConfig })),
    mapRow: jest.fn((_entidad: string, row: Record<string, unknown>) => row),
  };
  const insurerConnection = {
    getConnectionConfig: jest.fn(async () => ({
      adapterCodigo: 'MUNDIAL',
      tipoDb: 'mssql',
      origenConfig: { recibos: originConfig },
    })),
    querySource: jest.fn(async () => opts.filas ?? FILAS),
  };
  const adapterFactory = { getAdapter: jest.fn(() => adapter) };
  const watermarkRepo = {
    getWatermark: jest.fn(async () => ({ last_run_at: new Date(), last_modified_at: null, last_error: null })),
    upsertWatermark: jest.fn(async () => undefined),
  };
  const syncLock = { tryAcquire: jest.fn(async () => true), release: jest.fn(async () => undefined) };
  const upsertRepo = {
    upsertRecibosChangedBatch: jest.fn(async (_id: number, rows: unknown[]) => opts.changed ?? rows.length),
    insertRecibosBatch: jest.fn(async () => undefined),
  };
  const localRepo = {
    countLocalRows: jest.fn(async () => 100),
    deleteLocalRows: jest.fn(async () => 0),
    deleteByOrigenClaves: jest.fn(async () => 0),
    deleteScopeNotIn: jest.fn(async () => opts.huerfanas ?? 0),
  };
  const reportesPg = { runInTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) };

  const service = new SyncService(
    config as never,
    insurerConnection as never,
    adapterFactory as never,
    watermarkRepo as never,
    syncLock as never,
    upsertRepo as never,
    localRepo as never,
    reportesPg as never,
  );
  return { service, insurerConnection, syncLock, upsertRepo, localRepo, watermarkRepo };
}

const filtros = {
  aseguradoraId: 1,
  desde: new Date('2026-01-01T00:00:00Z'),
  hasta: new Date('2026-01-31T00:00:00Z'),
};

describe('SyncService · recibos por diferencias', () => {
  it('escribe solo lo nuevo o modificado y borra del alcance lo que ya no vino del origen', async () => {
    const { service, upsertRepo, localRepo } = build({}, { changed: 1 });
    const r = await service.syncIncremental('recibos', filtros, { ignoreTtl: true });

    expect(upsertRepo.upsertRecibosChangedBatch).toHaveBeenCalledTimes(1);
    expect(upsertRepo.insertRecibosBatch).not.toHaveBeenCalled();
    expect(localRepo.deleteLocalRows).not.toHaveBeenCalled();
    expect(localRepo.deleteByOrigenClaves).not.toHaveBeenCalled();
    const llamada = localRepo.deleteScopeNotIn.mock.calls[0] as unknown[];
    expect(llamada[2]).toEqual(['R-1', 'R-2', 'R-3']);
    expect(r.skipped).toBe(false);
    expect(r.rowsSynced).toBe(3);
    expect(r.rowsChanged).toBe(1);
  });

  it('con REPORTES_SYNC_RECIBOS_DELTA=false conserva el comportamiento anterior (borrar rango e insertar todo)', async () => {
    const { service, upsertRepo, localRepo } = build({ REPORTES_SYNC_RECIBOS_DELTA: false });
    const r = await service.syncIncremental('recibos', filtros, { ignoreTtl: true });

    expect(upsertRepo.upsertRecibosChangedBatch).not.toHaveBeenCalled();
    expect(upsertRepo.insertRecibosBatch).toHaveBeenCalledTimes(1);
    expect(localRepo.deleteLocalRows).toHaveBeenCalledTimes(1);
    expect(localRepo.deleteScopeNotIn).not.toHaveBeenCalled();
    expect(r.rowsSynced).toBe(3);
    expect(r.rowsChanged).toBeUndefined();
  });

  it('frena y revierte si el origen devolvió mucho menos de lo que había en el alcance', async () => {
    const { service } = build({}, { huerfanas: 500 });
    const r = await service.syncIncremental('recibos', filtros, { ignoreTtl: true });
    expect(r.stale).toBe(true);
    expect(r.warning).toContain('se revierte');
  });

  it('con un filtro distinto de fecha y estado (p. ej. ramo) solo actualiza: no borra nada del alcance', async () => {
    const { service, localRepo, upsertRepo } = build({}, { filterParams: { ramo: { source: 'ramo', type: 'int' } } });
    const r = await service.syncIncremental('recibos', { ...filtros, ramo: 18 }, { ignoreTtl: true });

    expect(upsertRepo.upsertRecibosChangedBatch).toHaveBeenCalledTimes(1);
    expect(localRepo.deleteScopeNotIn).not.toHaveBeenCalled();
    expect(r.skipped).toBe(false);
  });
});

describe('SyncService · vigencia por alcance', () => {
  it('sin alcance, un sync reciente de la entidad hace saltar el refresco (TTL por entidad, como antes)', async () => {
    const { service, insurerConnection } = build();
    const r = await service.syncIncremental('recibos', filtros, {});
    expect(r.skipped).toBe(true);
    expect(insurerConnection.querySource).not.toHaveBeenCalled();
  });

  it('con alcance, el sync reciente de OTRO rango no impide refrescar este', async () => {
    const { service, insurerConnection } = build();
    const r = await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    expect(r.skipped).toBe(false);
    expect(insurerConnection.querySource).toHaveBeenCalledTimes(1);
  });

  it('el mismo alcance dentro del TTL no vuelve al origen; otro alcance sí', async () => {
    const { service, insurerConnection } = build({ REPORTES_SYNC_SCOPE_TTL_SECONDS: 30 });
    await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    const repetido = await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    const otro = await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|B' });

    expect(repetido.skipped).toBe(true);
    expect(repetido.reason).toContain('alcance sincronizado');
    expect(otro.skipped).toBe(false);
    expect(insurerConnection.querySource).toHaveBeenCalledTimes(2);
  });

  it('forceSync ignora la vigencia del alcance', async () => {
    const { service, insurerConnection } = build();
    await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    const forzado = await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A', force: true });
    expect(forzado.skipped).toBe(false);
    expect(insurerConnection.querySource).toHaveBeenCalledTimes(2);
  });

  it('con REPORTES_SYNC_SCOPE_TTL_SECONDS=0 siempre consulta el origen', async () => {
    const { service, insurerConnection } = build({ REPORTES_SYNC_SCOPE_TTL_SECONDS: 0 });
    await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    expect(insurerConnection.querySource).toHaveBeenCalledTimes(2);
  });
});

describe('SyncService · candado', () => {
  it('sin alcance, si hay otro sync en curso responde de inmediato con datos locales (como antes)', async () => {
    const { service, syncLock } = build();
    syncLock.tryAcquire.mockResolvedValue(false);
    const t0 = Date.now();
    const r = await service.syncIncremental('recibos', filtros, { ignoreTtl: true });
    expect(r.skipped).toBe(true);
    expect(r.stale).toBe(true);
    expect(syncLock.tryAcquire).toHaveBeenCalledTimes(1);
    expect(Date.now() - t0).toBeLessThan(400);
  });

  it('con alcance, espera a que termine el sync en curso y luego refresca su rango', async () => {
    const { service, syncLock, insurerConnection } = build({ REPORTES_SYNC_LOCK_WAIT_SECONDS: 5 });
    syncLock.tryAcquire
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const r = await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    expect(syncLock.tryAcquire).toHaveBeenCalledTimes(3);
    expect(r.skipped).toBe(false);
    expect(insurerConnection.querySource).toHaveBeenCalledTimes(1);
    expect(syncLock.release).toHaveBeenCalledTimes(1);
  });

  it('si otra consulta sincronizó el mismo alcance mientras esperaba, no repite el trabajo', async () => {
    const { service, syncLock, insurerConnection } = build({ REPORTES_SYNC_LOCK_WAIT_SECONDS: 5 });
    // primera consulta: sincroniza y deja el alcance vigente
    await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    // segunda: ya vigente antes de pedir el candado
    syncLock.tryAcquire.mockClear();
    const r = await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    expect(r.skipped).toBe(true);
    expect(syncLock.tryAcquire).not.toHaveBeenCalled();
    expect(insurerConnection.querySource).toHaveBeenCalledTimes(1);
  });

  it('si la espera se agota responde con datos locales sin fallar', async () => {
    const { service, syncLock } = build({ REPORTES_SYNC_LOCK_WAIT_SECONDS: 1 });
    syncLock.tryAcquire.mockResolvedValue(false);
    const r = await service.syncIncremental('recibos', filtros, { scopeKey: 'recibos|A' });
    expect(r.skipped).toBe(true);
    expect(r.stale).toBe(true);
  });
});
