import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ArysMonitorReporterService } from '../arys/arys-monitor-reporter.service';
import { BcvRateRepository } from './repositories/bcv-rate.repository';

const INTERVALO_MS = 15 * 60_000;
/** Mientras falte la tasa se reporta cada 15 min; el incidente se cierra solo cuando deja de repetirse. */
const AUTO_RESOLVE_MIN = 45;

/**
 * Vigila que las tasas del día estén completas. Un NULL en EUR no da error en ningún cálculo:
 * MAX(ptasamon) toma el dólar y la prima RCV en TCR sale más baja.
 */
@Injectable()
export class TasaMonedaWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasaMonedaWatchService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly tasas: BcvRateRepository,
    private readonly monitor: ArysMonitorReporterService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runOnce(), INTERVALO_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const incompletas = await this.tasas.findTasasIncompletas();
      if (!incompletas.length) return;

      const detalle = incompletas.map((t) => `${t.cmoneda} en ${t.tabla}`).join(', ');
      this.logger.error(`Tasa de cambio incompleta: ${detalle}`);
      await this.monitor.report({
        type: 'moneda.tasa.incompleta',
        severity: 'critical',
        title: 'Tasa de cambio incompleta en Sis2000',
        message: `Falta la tasa: ${detalle}. Las primas en TCR pueden estar saliendo mal.`,
        entity: [...new Set(incompletas.map((t) => t.cmoneda))].join(','),
        details: { incompletas },
        dedupeKey: 'moneda:tasa-incompleta',
        autoResolveMinutes: AUTO_RESOLVE_MIN,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`No se pudo revisar las tasas de cambio: ${msg}`);
    } finally {
      this.running = false;
    }
  }
}
