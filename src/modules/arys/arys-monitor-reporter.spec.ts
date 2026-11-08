import { ArysHttpError } from './arys.client';
import { ArysMembershipJobService, isPermanentArysError } from './arys-membership-job.service';
import { ArysDataError } from './arys.utils';
import { ArysMonitorReporterService } from './arys-monitor-reporter.service';

const enabledConfig = {
  monitorEnabled: true,
  monitorUrl: 'http://monitor.test/events/business',
  monitorAppId: 'sysip-nest-api',
  monitorToken: 'tok',
};

describe('ArysMonitorReporterService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('no envía nada si el monitor está desactivado en BD', async () => {
    global.fetch = jest.fn();
    const svc = new ArysMonitorReporterService({
      get: async () => ({ ...enabledConfig, monitorEnabled: false }),
    } as never);
    await svc.report({ type: 't', severity: 'warning', title: 'x', message: 'm' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('envía el evento con token y appId tomados de la BD', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const svc = new ArysMonitorReporterService({ get: async () => enabledConfig } as never);
    await svc.report({ type: 'arys.membership.failed', severity: 'warning', title: 'x', message: 'm' });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://monitor.test/events/business');
    expect(init.headers['x-monitor-ingest-token']).toBe('tok');
    expect(JSON.parse(init.body)).toMatchObject({ appId: 'sysip-nest-api', type: 'arys.membership.failed' });
  });

  it('nunca lanza si el monitor no responde', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new ArysMonitorReporterService({ get: async () => enabledConfig } as never);
    await expect(
      svc.report({ type: 't', severity: 'warning', title: 'x', message: 'm' }),
    ).resolves.toBeUndefined();
  });
});

describe('ArysMembershipJobService → monitor', () => {
  function build() {
    const prisma = {
      isEnabled: () => true,
      $transaction: jest.fn().mockResolvedValue([]),
      arysMembershipJob: { update: jest.fn() },
      arysMembershipAttempt: { create: jest.fn() },
    };
    const config = {
      get: async () => ({ retryBaseMinutes: 15, retryMaxMinutes: 360, maxAttempts: 5 }),
    };
    const reporter = { report: jest.fn().mockResolvedValue(undefined) };
    const svc = new ArysMembershipJobService(prisma as never, config as never, reporter as never);
    return { svc, reporter, prisma };
  }
  const job = (attempts: number) =>
    ({ id: 'j', cnpoliza: 'N1', attempts, maxAttempts: 5, personaId: 1, vehiculoId: 2 }) as never;

  it('avisa el primer fallo', async () => {
    const { svc, reporter } = build();
    await svc.markFailure(job(1), 'subscripcion', new ArysHttpError('HTTP 500', 500, {}, 'boom'));
    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'arys.membership.failed', severity: 'warning', notify: true, entity: 'N1' }),
    );
  });

  it('los fallos intermedios solo agrupan, sin notificar', async () => {
    const { svc, reporter } = build();
    await svc.markFailure(job(3), 'subscripcion', new Error('x'));
    expect(reporter.report).toHaveBeenCalledWith(expect.objectContaining({ notify: false }));
  });

  it('al agotar intentos es crítico y notifica', async () => {
    const { svc, reporter } = build();
    await svc.markFailure(job(5), 'subscripcion', new Error('x'));
    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'arys.membership.dead', severity: 'critical', notify: true }),
    );
  });

  it('avisa la recuperación solo si antes había fallado', async () => {
    const { svc, reporter } = build();
    await svc.markSuccess(job(1), { request: {}, response: {} });
    expect(reporter.report).not.toHaveBeenCalled();
    await svc.markSuccess(job(2), { request: {}, response: {} });
    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'arys.membership.recovered',
        severity: 'info',
        notify: true,
        resolves: [
          'arys-membership:N1:failed',
          'arys-membership:N1:dead',
          'arys-membership:N1:needs_data',
        ],
      }),
    );
  });

  it('un error de datos queda en NEEDS_DATA desde el primer intento, sin reintento, y guarda body y respuesta', async () => {
    const { svc, reporter, prisma } = build();
    await svc.markFailure(
      job(1),
      'propietario',
      new ArysDataError('Arys rechazó el registro del propietario.', { rif: '1' }, '{"result":0}'),
    );
    expect(prisma.arysMembershipJob.update.mock.calls[0][0].data).toMatchObject({
      status: 'NEEDS_DATA',
      nextRetryAt: null,
    });
    expect(prisma.arysMembershipAttempt.create.mock.calls[0][0].data).toMatchObject({
      requestBody: { rif: '1' },
      responseBody: '{"result":0}',
    });
    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'arys.membership.needs_data', notify: true }),
    );
  });

  it('un 500 de Arys sigue reintentándose', async () => {
    const { svc, prisma } = build();
    await svc.markFailure(job(1), 'subscripcion', new ArysHttpError('HTTP 500', 500, {}, 'boom'));
    expect(prisma.arysMembershipJob.update.mock.calls[0][0].data.status).toBe('FAILED');
  });
});

describe('isPermanentArysError', () => {
  it.each([
    [new ArysDataError('Estado no encontrado', {}), true],
    [new ArysDataError('isSuccess=false', {}, '{}', false), false],
    [new ArysHttpError('400', 400, {}, ''), true],
    [new ArysHttpError('429', 429, {}, ''), false],
    [new ArysHttpError('503', 503, {}, ''), false],
    [new Error('timeout'), false],
  ])('%s → %s', (error, expected) => {
    expect(isPermanentArysError(error)).toBe(expected);
  });
});
