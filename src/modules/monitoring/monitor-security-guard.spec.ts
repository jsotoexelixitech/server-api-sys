import { MonitorSecurityGuard } from './monitor-security-guard';

const on = { monitorEnabled: true, monitorSecurityEnforce: true };
const req = (ip: string, url = '/v1/emision') =>
  ({ headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: '10.0.0.1' }, originalUrl: url, url }) as never;
const future = new Date(Date.now() + 600_000).toISOString();

function guard() {
  const ingest = { fetchBlocklist: jest.fn().mockResolvedValue(null) };
  const g = new MonitorSecurityGuard({ get: async () => on } as never, ingest as never);
  return { g, ingest };
}

describe('MonitorSecurityGuard', () => {
  it('bloquea una IP pública baneada cuando ambas llaves están activas', () => {
    const { g } = guard();
    g.apply(true, [{ ip: '203.0.113.9', expiresAt: future }]);
    expect(g.shouldBlock(on, req('203.0.113.9'))).toBe(true);
    expect(g.shouldBlock(on, req('203.0.113.10'))).toBe(false);
  });

  it('no bloquea si el interruptor de la BD está apagado (llave 1)', () => {
    const { g } = guard();
    g.apply(true, [{ ip: '203.0.113.9', expiresAt: future }]);
    expect(g.shouldBlock({ ...on, monitorSecurityEnforce: false }, req('203.0.113.9'))).toBe(false);
    expect(g.shouldBlock({ ...on, monitorEnabled: false }, req('203.0.113.9'))).toBe(false);
  });

  it('no bloquea si el monitor está en DRY-RUN (llave 2)', () => {
    const { g } = guard();
    g.apply(false, [{ ip: '203.0.113.9', expiresAt: future }]);
    expect(g.shouldBlock(on, req('203.0.113.9'))).toBe(false);
  });

  it('nunca bloquea IPs privadas ni /health', () => {
    const { g } = guard();
    g.apply(true, [
      { ip: '10.1.2.3', expiresAt: future },
      { ip: '203.0.113.9', expiresAt: future },
    ]);
    expect(g.shouldBlock(on, req('10.1.2.3'))).toBe(false);
    expect(g.shouldBlock(on, req('203.0.113.9', '/health'))).toBe(false);
  });

  it('un ban vencido deja de aplicarse', () => {
    const { g } = guard();
    g.apply(true, [{ ip: '203.0.113.9', expiresAt: new Date(Date.now() - 1000).toISOString() }]);
    expect(g.shouldBlock(on, req('203.0.113.9'))).toBe(false);
  });

  it('falla abierto: sin lista válida no bloquea nada y refresca en segundo plano', () => {
    const { g, ingest } = guard();
    expect(g.shouldBlock(on, req('203.0.113.9'))).toBe(false);
    expect(ingest.fetchBlocklist).toHaveBeenCalledTimes(1);
  });

  it('el middleware responde 403 con cabecera y no llama a next', async () => {
    const { g } = guard();
    g.apply(true, [{ ip: '203.0.113.9', expiresAt: future }]);
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    g.middleware()(req('203.0.113.9'), res as never, next);
    await new Promise((r) => setImmediate(r));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.setHeader).toHaveBeenCalledWith('X-Exelixi-Security', 'block');
    expect(next).not.toHaveBeenCalled();
  });

  it('el middleware deja pasar y no lanza si la config falla', async () => {
    const g = new MonitorSecurityGuard({ get: async () => Promise.reject(new Error('bd')) } as never, {} as never);
    const next = jest.fn();
    g.middleware()(req('203.0.113.9'), {} as never, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledTimes(1);
  });
});
