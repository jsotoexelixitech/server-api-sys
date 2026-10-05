import { ArysMembershipConfigService } from './arys-membership-config.service';

const row = {
  retryEnabled: true,
  retryIntervalSeconds: 300,
  maxAttempts: 5,
  retryBaseMinutes: 15,
  retryMaxMinutes: 360,
  batchSize: 10,
  monitorEnabled: true,
  monitorUrl: 'http://127.0.0.1:3098/monitor-api/events/business',
  monitorAppId: 'sysip-nest-api',
  monitorToken: 'tok',
  monitorReport5xx: true,
  monitorSecurityObserve: false,
};

function build(findUnique: jest.Mock) {
  const prisma = { isEnabled: () => true, arysMembershipConfig: { findUnique } };
  return new ArysMembershipConfigService(prisma as never);
}

describe('ArysMembershipConfigService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('lee la config de la BD', async () => {
    const svc = build(jest.fn().mockResolvedValue(row));
    expect((await svc.get()).monitorEnabled).toBe(true);
  });

  it('si la BD falla conserva la última config válida (no apaga el reporte al monitor)', async () => {
    const findUnique = jest.fn().mockResolvedValueOnce(row).mockRejectedValue(new Error('permission denied'));
    const svc = build(findUnique);
    expect((await svc.get()).monitorEnabled).toBe(true);

    jest.advanceTimersByTime(31_000); // expira la caché
    const after = await svc.get();
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(after.monitorEnabled).toBe(true);
    expect(after.monitorToken).toBe('tok');
  });

  it('al arrancar con la BD caída usa los valores por defecto (reporte apagado)', async () => {
    const svc = build(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const cfg = await svc.get();
    expect(cfg.monitorEnabled).toBe(false);
    expect(cfg.retryEnabled).toBe(false);
  });

  it('recupera la config nueva cuando la BD vuelve', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(row)
      .mockRejectedValueOnce(new Error('caída'))
      .mockResolvedValue({ ...row, monitorEnabled: false });
    const svc = build(findUnique);
    await svc.get();
    jest.advanceTimersByTime(31_000);
    await svc.get(); // falla: conserva
    jest.advanceTimersByTime(31_000);
    expect((await svc.get()).monitorEnabled).toBe(false); // ya refleja el cambio real
  });
});
