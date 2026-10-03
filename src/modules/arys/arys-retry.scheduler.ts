import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ArysMembershipConfigService } from './arys-membership-config.service';
import { ArysMembershipJobService } from './arys-membership-job.service';
import { ArysService } from './arys.service';

const IDLE_CHECK_MS = 60_000;

/**
 * Reintento periódico de membresías Arys fallidas.
 * Lee la configuración de BD en cada ciclo (retry_enabled, intervalo, lote): se activa,
 * se apaga o cambia de ritmo sin reiniciar PM2.
 */
@Injectable()
export class ArysRetryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArysRetryScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly config: ArysMembershipConfigService,
    private readonly arys: ArysService,
    private readonly jobs: ArysMembershipJobService,
  ) {}

  onModuleInit(): void {
    if (!this.jobs.isEnabled()) return;
    this.schedule(IDLE_CHECK_MS);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    let next = IDLE_CHECK_MS;
    try {
      const cfg = await this.config.get();
      if (cfg.retryEnabled) {
        next = cfg.retryIntervalSeconds * 1000;
        const { processed, succeeded } = await this.arys.retryDueMemberships(cfg.batchSize);
        if (processed > 0) {
          this.logger.log(`Reintento Arys: procesadas=${processed} exitosas=${succeeded}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Reintento Arys falló: ${msg}`);
    } finally {
      this.schedule(next);
    }
  }
}
