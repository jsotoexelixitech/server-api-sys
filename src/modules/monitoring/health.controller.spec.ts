import { HealthController } from './health.controller';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { SKIP_ENVELOPE_KEY } from '../../common/decorators/skip-envelope.decorator';
import { MonitorSecurityGuard } from './monitor-security-guard';

describe('HealthController', () => {
  it('responde ok con el uptime', () => {
    const res = new HealthController().health();
    expect(res.status).toBe('ok');
    expect(res.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it('es público y sin envoltorio', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    expect(Reflect.getMetadata(SKIP_ENVELOPE_KEY, HealthController)).toBe(true);
  });

  it('su ruta (/api/health) está exenta del bloqueo aunque la IP esté baneada', () => {
    const guard = new MonitorSecurityGuard({} as never, {} as never);
    guard.apply(true, [{ ip: '203.0.113.9', expiresAt: new Date(Date.now() + 600_000).toISOString() }]);
    const cfg = { monitorEnabled: true, monitorSecurityEnforce: true };
    const req = (url: string) =>
      ({ headers: { 'x-forwarded-for': '203.0.113.9' }, socket: {}, originalUrl: url, url }) as never;
    expect(guard.shouldBlock(cfg, req('/api/health'))).toBe(false);
    expect(guard.shouldBlock(cfg, req('/api/v1/emision'))).toBe(true);
  });
});
