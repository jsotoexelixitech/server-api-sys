import { Injectable, Logger } from '@nestjs/common';
import { ArysMembershipConfigService } from './arys-membership-config.service';

export interface ArysMonitorEvent {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  /** Entidad afectada (cnpoliza). */
  entity?: string;
  details?: Record<string, unknown>;
  dedupeKey?: string;
  notify?: boolean;
  /** dedupeKeys de eventos previos cuyo incidente en el monitor queda resuelto. */
  resolves?: string[];
}

const TIMEOUT_MS = 4000;

/**
 * Reporta eventos de negocio a Exelixi Monitor (fire-and-forget).
 * La URL, el token y el interruptor viven en BD (arys_membership_config): se cambian sin reiniciar PM2.
 * Nunca lanza: si el monitor está caído, el flujo de emisión no se ve afectado.
 */
@Injectable()
export class ArysMonitorReporterService {
  private readonly logger = new Logger(ArysMonitorReporterService.name);

  constructor(private readonly config: ArysMembershipConfigService) {}

  async report(event: ArysMonitorEvent): Promise<void> {
    try {
      const cfg = await this.config.get();
      if (!cfg.monitorEnabled) return;
      if (!cfg.monitorUrl || !cfg.monitorToken) {
        this.logger.warn('monitor_enabled=true pero falta monitor_url o monitor_token en BD');
        return;
      }

      const res = await fetch(cfg.monitorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-monitor-ingest-token': cfg.monitorToken,
        },
        body: JSON.stringify({ ...event, appId: cfg.monitorAppId, at: new Date().toISOString() }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Monitor respondió HTTP ${res.status} al reportar ${event.type}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`No se pudo reportar al monitor (${event.type}): ${msg}`);
    }
  }
}
