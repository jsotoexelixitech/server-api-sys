import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MonitorIngestService } from './monitor-ingest.service';

/** Rutas que no aportan señal de ataque y generarían ruido. */
const SKIP_PATH = /^\/(?:[^/]+\/)?(?:health|docs|swagger|favicon)/i;
const AUTH_PATH = /\/(?:auth|login|refresh|token)(?:\/|$|\?)/i;
const SECRET_PARAM = /^(?:.*(?:key|token|secret|pass|auth|sig).*)$/i;

/**
 * Observador de seguridad en modo DRY-RUN.
 *
 * Envía al monitor, sin esperar respuesta, las peticiones que llegan de IPs externas para que
 * detecte patrones (SQLi, XSS, fuerza bruta, scanners). NUNCA bloquea, no modifica la petición ni la
 * retrasa: llama a next() de inmediato y reporta cuando la respuesta ya terminó. No envía el cuerpo (puede traer datos de asegurados) y
 * redacta parámetros sensibles del query. Se ignoran IPs privadas (tráfico servicio a servicio).
 * Apagado por defecto: monitor_security_observe en arys_membership_config.
 */
@Injectable()
export class MonitorSecurityObserver {
  constructor(private readonly ingest: MonitorIngestService) {}

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      next();
      // Se observa al terminar la respuesta para conocer su código (login fallido = 401/403).
      res.once?.('finish', () => void this.observe(req, res.statusCode));
    };
  }

  private async observe(req: Request, statusCode?: number): Promise<void> {
    try {
      if (req.method === 'OPTIONS') return;
      const path = (req.originalUrl || req.url || '/').split('?')[0];
      if (SKIP_PATH.test(path)) return;
      if (!(await this.ingest.securityObserveEnabled())) return;

      const ip = MonitorSecurityObserver.clientIp(req);
      if (!ip || MonitorSecurityObserver.isPrivateIp(ip)) return;

      const rawQuery = (req.originalUrl || req.url || '').split('?')[1] ?? '';
      await this.ingest.observeRequest({
        ip,
        method: req.method,
        path,
        query: MonitorSecurityObserver.redactQuery(rawQuery),
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || undefined,
        isAuthEndpoint: AUTH_PATH.test(path),
        statusCode,
      });
    } catch {
      // un observador jamás debe afectar a la API
    }
  }

  static clientIp(req: Pick<Request, 'headers' | 'socket'>): string {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    return (first || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  }

  static isPrivateIp(ip: string): boolean {
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return true;
    if (/^(?:fc|fd|fe80)/i.test(ip)) return true;
    const m = /^(\d+)\.(\d+)\./.exec(ip);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }

  static redactQuery(query: string): string {
    return query
      .split('&')
      .map((pair) => {
        const [k, v] = pair.split('=');
        return v !== undefined && SECRET_PARAM.test(decodeURIComponent(k || '')) ? `${k}=[redactado]` : pair;
      })
      .join('&')
      .slice(0, 300);
  }
}
