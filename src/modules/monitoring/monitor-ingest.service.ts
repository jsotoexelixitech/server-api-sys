import { Injectable, Logger } from '@nestjs/common';
import { ArysMembershipConfigService } from '../arys/arys-membership-config.service';

export interface ServerErrorReport {
  method: string;
  path: string;
  statusCode: number;
  message: string;
  errorName?: string;
  stackPreview?: string;
  requestId?: string;
}

export interface SecurityEvaluateReport {
  ip: string;
  method: string;
  path: string;
  query?: string;
  userAgent?: string;
  isAuthEndpoint?: boolean;
  /** Código HTTP de la respuesta: permite detectar fuerza bruta en endpoints de autenticación. */
  statusCode?: number;
}

const TIMEOUT_MS = 3000;
/** Tope de envíos simultáneos: ante una tormenta se descarta, nunca se encola ni se bloquea la API. */
const MAX_IN_FLIGHT = 25;
/** Un mismo error (método + ruta + código) se reporta como máximo una vez en esta ventana. */
const ERROR_THROTTLE_MS = 10_000;

/**
 * Cliente de Exelixi Monitor para errores 5xx y observación de seguridad.
 * La URL, el token y los interruptores viven en BD (arys_membership_config): se cambian sin reiniciar PM2.
 * Todo es fire-and-forget y nunca lanza: si el monitor está caído, la API no se entera.
 */
@Injectable()
export class MonitorIngestService {
  private readonly logger = new Logger(MonitorIngestService.name);
  private inFlight = 0;
  private readonly lastErrorAt = new Map<string, number>();

  constructor(private readonly config: ArysMembershipConfigService) {}

  /** Reporta un 5xx. Devuelve la promesa solo para poder esperarla en pruebas. */
  async reportServerError(report: ServerErrorReport): Promise<void> {
    try {
      const target = await this.target();
      if (!target || !target.cfg.monitorReport5xx) return;
      if (this.throttled(`${report.method} ${report.path} ${report.statusCode}`)) return;

      await this.post(`${target.base}/events/errors`, target.token, {
        appId: target.cfg.monitorAppId,
        method: report.method,
        path: report.path,
        statusCode: report.statusCode,
        message: report.message.slice(0, 300),
        errorName: report.errorName,
        stackPreview: report.stackPreview?.slice(0, 1500),
        requestId: report.requestId,
        blocksUser: true,
        at: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.debug(`reportServerError: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Reporta una petición externa al motor de seguridad del monitor (POST /security/events).
   * Se usa 'events' y no 'evaluate': el primero registra el evento y alerta; el segundo solo decide.
   * El resultado se ignora (dry-run): la API nunca actúa sobre él.
   */
  async observeRequest(report: SecurityEvaluateReport): Promise<void> {
    try {
      const target = await this.target();
      if (!target || !target.cfg.monitorSecurityObserve) return;
      await this.post(`${target.base}/security/events`, target.token, {
        appId: target.cfg.monitorAppId,
        ...report,
      });
    } catch (err) {
      this.logger.debug(`observeRequest: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** ¿Está activo el observador de seguridad? Permite a quien llama evitar trabajo si no lo está. */
  async securityObserveEnabled(): Promise<boolean> {
    const cfg = await this.config.get();
    return cfg.monitorEnabled && cfg.monitorSecurityObserve && Boolean(cfg.monitorUrl && cfg.monitorToken);
  }

  /** La URL guardada apunta a events/business; el resto de endpoints cuelgan de la misma base. */
  static baseUrl(monitorUrl: string): string {
    return monitorUrl.replace(/\/events\/business\/?$/, '').replace(/\/+$/, '');
  }

  private async target() {
    const cfg = await this.config.get();
    if (!cfg.monitorEnabled || !cfg.monitorUrl || !cfg.monitorToken) return null;
    return { cfg, token: cfg.monitorToken, base: MonitorIngestService.baseUrl(cfg.monitorUrl) };
  }

  private throttled(key: string): boolean {
    const now = Date.now();
    const last = this.lastErrorAt.get(key) ?? 0;
    if (now - last < ERROR_THROTTLE_MS) return true;
    this.lastErrorAt.set(key, now);
    if (this.lastErrorAt.size > 500) {
      for (const [k, t] of this.lastErrorAt) if (now - t > ERROR_THROTTLE_MS) this.lastErrorAt.delete(k);
    }
    return false;
  }

  private async post(url: string, token: string, body: unknown): Promise<void> {
    if (this.inFlight >= MAX_IN_FLIGHT) return;
    this.inFlight += 1;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-monitor-ingest-token': token },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) this.logger.debug(`Monitor respondió HTTP ${res.status} en ${url}`);
    } finally {
      this.inFlight -= 1;
    }
  }
}
