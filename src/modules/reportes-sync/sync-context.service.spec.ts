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

  it('cada entidad tiene su propia variable: desactivar recibos no afecta a siniestros ni pólizas', async () => {
    const { service, syncService } = build({
      REPORTES_SYNC_ENABLED: true,
      REPORTES_SYNC_RECIBOS_ON_EXECUTE: false,
    });
    await service.maybeSyncBeforeReport('siniestros', body);
    await service.maybeSyncBeforeReport('polizas', body);
    expect(syncService.syncIncremental).toHaveBeenCalledTimes(2);
  });

  it('REPORTES_SYNC_SINIESTROS_ON_EXECUTE=false: la consulta de siniestros no sincroniza', async () => {
    const { service, syncService } = build({
      REPORTES_SYNC_ENABLED: true,
      REPORTES_SYNC_SINIESTROS_ON_EXECUTE: false,
    });
    const result = (await service.maybeSyncBeforeReport('siniestros', body)) as { skipped: boolean };
    expect(result.skipped).toBe(true);
    expect(syncService.syncIncremental).not.toHaveBeenCalled();
    await service.maybeSyncBeforeReport('recibos', body);
    expect(syncService.syncIncremental).toHaveBeenCalledTimes(1);
  });

  it('siniestros con forceSync sincroniza aunque la consulta lo tenga desactivado', async () => {
    const { service, syncService } = build({
      REPORTES_SYNC_ENABLED: true,
      REPORTES_SYNC_SINIESTROS_ON_EXECUTE: false,
    });
    await service.maybeSyncBeforeReport('siniestros', { ...body, forceSync: true });
    expect(syncService.syncIncremental).toHaveBeenCalledTimes(1);
  });

  it('con el sync general apagado no sincroniza nada', async () => {
    const { service, syncService } = build({ REPORTES_SYNC_ENABLED: false });
    await service.maybeSyncBeforeReport('recibos', body);
    expect(syncService.syncIncremental).not.toHaveBeenCalled();
  });
});

describe('SyncContextService · catálogos al abrir', () => {
  it('si un catálogo falla, los demás se sincronizan y el fallo se informa', async () => {
    const { service, syncService } = build({ REPORTES_SYNC_ENABLED: true });
    syncService.syncIncremental.mockImplementation((async (entidad: string) => {
      if (entidad === 'ramos') throw new Error('column "id_aseguradora" does not exist');
      return { entidad, rowsSynced: 3, skipped: false };
    }) as never);

    const result = (await service.maybeSyncCatalogsOnOpen({}, {})) as {
      skipped: boolean;
      catalogs: Array<{ entidad: string; rowsSynced?: number; error?: string }>;
    };

    expect(result.skipped).toBe(false);
    expect(syncService.syncIncremental).toHaveBeenCalledTimes(6);
    expect(result.catalogs.find((c) => c.entidad === 'ramos')?.error).toContain('id_aseguradora');
    expect(result.catalogs.find((c) => c.entidad === 'coberturas')?.rowsSynced).toBe(3);
  });
});

describe('SyncContextService · sync al consultar pólizas', () => {
  it('con REPORTES_SYNC_POLIZAS_ON_EXECUTE=false la consulta de pólizas no sincroniza', async () => {
    const { service, syncService } = build({
      REPORTES_SYNC_ENABLED: true,
      REPORTES_SYNC_POLIZAS_ON_EXECUTE: false,
    });
    const result = (await service.maybeSyncBeforeReport('polizas', body)) as { skipped: boolean; reason: string };
    expect(syncService.syncIncremental).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('REPORTES_SYNC_POLIZAS_ON_EXECUTE=false');
  });

  it('forceSync sincroniza pólizas aunque el sync al consultar esté desactivado', async () => {
    const { service, syncService } = build({
      REPORTES_SYNC_ENABLED: true,
      REPORTES_SYNC_POLIZAS_ON_EXECUTE: false,
    });
    await service.maybeSyncBeforeReport('polizas', { ...body, forceSync: true });
    expect(syncService.syncIncremental).toHaveBeenCalledTimes(1);
  });
});
