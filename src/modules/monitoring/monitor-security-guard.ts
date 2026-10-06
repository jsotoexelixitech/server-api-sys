import { Injectable, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ArysMembershipConfigService } from '../arys/arys-membership-config.service';
import { MonitorIngestService } from './monitor-ingest.service';
import { MonitorSecurityObserver } from './monitor-security-observer';

const REFRESH_MS = 30_000;
/** Si el monitor deja de responder, las prohibiciones cacheadas dejan de aplicarse tras este tiempo. */
const STALE_MS = 5 * 60_000;
const SKIP_PATH = /^\/(?:[^/]+\/)?health(?:\/|$|\?)/i;

type GuardCfg = { monitorEnabled: boolean; monitorSecurityEnforce: boolean };
type GuardReq = Pick<Request, 'headers' | 'socket' | 'originalUrl' | 'url'>;

/**
 * Hace cumplir la blocklist de Exelixi Monitor (responde 403 a IPs baneadas).
 *
 * Doble llave: solo bloquea si `monitor_security_enforce` está activo en BD Y el monitor reporta
 * `enforce: true` (SECURITY_ENFORCE en el monitor). Es fail-open: si el monitor no responde, la lista
 * caduca y todo pasa. La decisión es una consulta a memoria; la lista se refresca en segundo plano.
 * Nunca bloquea IPs privadas ni /health, para no cortar tráfico servicio a servicio ni los chequeos.
 */
@Injectable()
export class MonitorSecurityGuard {
  private readonly logger = new Logger(MonitorSecurityGuard.name);
  private bans = new Map<string, number>();
  private monitorEnforce = false;
  private lastOkAt = 0;
  private lastTryAt = 0;
  private refreshing = false;

  constructor(
    private readonly config: ArysMembershipConfigService,
    private readonly ingest: MonitorIngestService,
  ) {}

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      void this.handle(req, res, next);
    };
  }

  private async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (this.shouldBlock(await this.config.get(), req)) {
        res.setHeader('X-Exelixi-Security', 'block');
        res.status(403).json({ statusCode: 403, message: 'Forbidden' });
        return;
      }
    } catch {
      // fail-open: la seguridad perimetral jamás debe tumbar la API
    }
    next();
  }

  /** Decide si la petición debe bloquearse. Pública para poder probarla sin HTTP. */
  shouldBlock(cfg: GuardCfg, req: GuardReq): boolean {
    if (!cfg.monitorEnabled || !cfg.monitorSecurityEnforce) return false;
    this.refreshInBackground();
    if (!this.monitorEnforce || Date.now() - this.lastOkAt > STALE_MS) return false;
    const path = (req.originalUrl || req.url || '/').split('?')[0];
    if (SKIP_PATH.test(path)) return false;
    const ip = MonitorSecurityObserver.clientIp(req);
    if (!ip || MonitorSecurityObserver.isPrivateIp(ip)) return false;
    const expires = this.bans.get(ip);
    if (!expires) return false;
    if (expires <= Date.now()) {
      this.bans.delete(ip);
      return false;
    }
    return true;
  }

  /** Aplica el estado devuelto por el monitor (también usado en pruebas). */
  apply(enforce: boolean, bans: Array<{ ip: string; expiresAt: string }>): void {
    this.monitorEnforce = enforce;
    this.bans = new Map(bans.map((b) => [b.ip, Date.parse(b.expiresAt) || Date.now() + 60_000]));
    this.lastOkAt = Date.now();
    this.lastTryAt = Date.now();
  }

  private refreshInBackground(): void {
    const now = Date.now();
    if (this.refreshing || now - this.lastTryAt < REFRESH_MS) return;
    this.refreshing = true;
    this.lastTryAt = now;
    void this.ingest
      .fetchBlocklist()
      .then((data) => {
        if (data) this.apply(data.enforce, data.bans);
      })
      .catch((err) => this.logger.debug(`refresh: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        this.refreshing = false;
      });
  }
}
