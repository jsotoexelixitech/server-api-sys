import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { MonitorIngestService } from './monitor-ingest.service';
import { MonitorSecurityObserver } from './monitor-security-observer';

const baseCfg = {
  monitorEnabled: true,
  monitorUrl: 'http://127.0.0.1:3098/monitor-api/events/business',
  monitorToken: 'tok',
  monitorAppId: 'sysip-nest-api',
  monitorReport5xx: true,
  monitorSecurityObserve: true,
};

function ingestWith(cfg: Partial<typeof baseCfg> = {}) {
  return new MonitorIngestService({ get: async () => ({ ...baseCfg, ...cfg }) } as never);
}

describe('MonitorIngestService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('deriva la base desde la URL de events/business', () => {
    expect(MonitorIngestService.baseUrl('http://h:3098/monitor-api/events/business')).toBe('http://h:3098/monitor-api');
    expect(MonitorIngestService.baseUrl('http://h:3098/monitor-api/')).toBe('http://h:3098/monitor-api');
  });

  it('envía el 5xx a events/errors con token y appId de la BD', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 } as Response);
    await ingestWith().reportServerError({ method: 'POST', path: '/emision', statusCode: 500, message: 'boom' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3098/monitor-api/events/errors');
    expect(init.headers['x-monitor-ingest-token']).toBe('tok');
    expect(JSON.parse(init.body)).toMatchObject({ appId: 'sysip-nest-api', statusCode: 500, blocksUser: true });
  });

  it('no envía nada si el monitor o el reporte 5xx están apagados', async () => {
    global.fetch = jest.fn();
    await ingestWith({ monitorEnabled: false }).reportServerError({ method: 'GET', path: '/x', statusCode: 500, message: 'm' });
    await ingestWith({ monitorReport5xx: false }).reportServerError({ method: 'GET', path: '/x', statusCode: 500, message: 'm' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('agrupa el mismo error repetido en la ventana (no inunda al monitor)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 } as Response);
    const svc = ingestWith();
    for (let i = 0; i < 5; i += 1) {
      await svc.reportServerError({ method: 'GET', path: '/mismo', statusCode: 500, message: 'm' });
    }
    await svc.reportServerError({ method: 'GET', path: '/otro', statusCode: 500, message: 'm' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('nunca lanza si el monitor no responde', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      ingestWith().reportServerError({ method: 'GET', path: '/x', statusCode: 500, message: 'm' }),
    ).resolves.toBeUndefined();
  });
});

describe('MonitorSecurityObserver', () => {
  const req = (over: Record<string, unknown> = {}) =>
    ({
      method: 'GET',
      originalUrl: '/api/polizas?x=1',
      url: '/api/polizas?x=1',
      headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'sqlmap/1.7' },
      socket: { remoteAddress: '127.0.0.1' },
      ...over,
    }) as never;

  it('llama a next() de inmediato y nunca bloquea', () => {
    const observer = new MonitorSecurityObserver({ securityObserveEnabled: () => new Promise(() => undefined) } as never);
    const next = jest.fn();
    observer.middleware()(req(), {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('envía al monitor solo tráfico externo y sin cuerpo', async () => {
    const observeRequest = jest.fn().mockResolvedValue(undefined);
    const observer = new MonitorSecurityObserver({ securityObserveEnabled: async () => true, observeRequest } as never);
    observer.middleware()(req(), {} as never, jest.fn());
    await new Promise((r) => setImmediate(r));
    expect(observeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '203.0.113.9', path: '/api/polizas', userAgent: 'sqlmap/1.7' }),
    );
    expect(Object.keys(observeRequest.mock.calls[0][0])).not.toContain('bodySnippet');
  });

  it('ignora IPs privadas, OPTIONS y health', async () => {
    const observeRequest = jest.fn().mockResolvedValue(undefined);
    const observer = new MonitorSecurityObserver({ securityObserveEnabled: async () => true, observeRequest } as never);
    const run = async (r: never) => {
      observer.middleware()(r, {} as never, jest.fn());
      await new Promise((resolve) => setImmediate(resolve));
    };
    await run(req({ headers: { 'x-forwarded-for': '10.0.0.5' } }));
    await run(req({ headers: {}, socket: { remoteAddress: '::ffff:192.168.8.20' } }));
    await run(req({ method: 'OPTIONS' }));
    await run(req({ originalUrl: '/v1/health', url: '/v1/health' }));
    expect(observeRequest).not.toHaveBeenCalled();
  });

  it('redacta parámetros sensibles del query', () => {
    expect(MonitorSecurityObserver.redactQuery('id=7&apikey=SECRETO&token=abc&q=hola')).toBe(
      'id=7&apikey=[redactado]&token=[redactado]&q=hola',
    );
  });

  it('detecta IPs privadas', () => {
    for (const ip of ['10.1.2.3', '172.30.149.75', '192.168.8.120', '127.0.0.1', '::1']) {
      expect(MonitorSecurityObserver.isPrivateIp(ip)).toBe(true);
    }
    expect(MonitorSecurityObserver.isPrivateIp('203.0.113.9')).toBe(false);
    expect(MonitorSecurityObserver.isPrivateIp('172.32.0.1')).toBe(false);
  });
});

describe('AllExceptionsFilter → monitor', () => {
  const host = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return {
      status,
      json,
      host: {
        switchToHttp: () => ({
          getResponse: () => ({ status }),
          getRequest: () => ({ method: 'POST', url: '/v1/emision?x=1', originalUrl: '/v1/emision?x=1', headers: {} }),
        }),
      } as never,
    };
  };

  it('reporta los 5xx y no altera la respuesta al cliente', () => {
    const monitor = { reportServerError: jest.fn() };
    const h = host();
    new AllExceptionsFilter(monitor as never).catch(new Error('SQL roto: tabla X'), h.host);
    expect(monitor.reportServerError).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/v1/emision', statusCode: 500, errorName: 'Error' }),
    );
    expect(h.status).toHaveBeenCalledWith(500);
    // el cliente nunca recibe el detalle interno
    expect(JSON.stringify(h.json.mock.calls[0][0])).not.toContain('tabla X');
  });

  it('no reporta los 4xx', () => {
    const monitor = { reportServerError: jest.fn() };
    new AllExceptionsFilter(monitor as never).catch(new HttpException('no autorizado', HttpStatus.UNAUTHORIZED), host().host);
    expect(monitor.reportServerError).not.toHaveBeenCalled();
  });

  it('funciona igual sin reporter', () => {
    const h = host();
    expect(() => new AllExceptionsFilter().catch(new Error('x'), h.host)).not.toThrow();
    expect(h.status).toHaveBeenCalledWith(500);
  });
});
