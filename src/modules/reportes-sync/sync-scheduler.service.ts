import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SyncOrchestratorService } from './sync-orchestrator.service';

/** Cada pasada refresca una ventana corta; `estado` usa la fecha propia de ese estado. */
const PASADAS: ReadonlyArray<{ nombre: string; estado?: string }> = [
  { nombre: 'vigencia (todos los estados)' },
  { nombre: 'cobrados (fecha de cobro)', estado: 'C' },
  { nombre: 'anulados (fecha de anulación)', estado: 'A' },
];

const MIN_INTERVALO_MIN = 5;
const MAX_VENTANA_DIAS = 60;

function isTrue(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Refresco periódico de recibos en segundo plano. Sin esto el reporte solo se actualiza
 * cuando alguien lo ejecuta, y los cambios de estado (cobros, anulaciones) llegan tarde.
 *
 * Usa ventanas cortas (no el sync completo, que vacía y recarga toda la aseguradora).
 * Desactivado por defecto: REPORTES_SYNC_SCHEDULE_ENABLED=true para activarlo.
 */
@Injectable()
export class SyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly orchestrator: SyncOrchestratorService,
  ) {}

  onModuleInit(): void {
    if (
      !isTrue(this.config.get('REPORTES_SYNC_ENABLED')) ||
      !isTrue(this.config.get('REPORTES_SYNC_SCHEDULE_ENABLED'))
    ) {
      return;
    }
    const minutos = clampInt(
      this.config.get('REPORTES_SYNC_SCHEDULE_INTERVAL_MINUTES'),
      30,
      MIN_INTERVALO_MIN,
      24 * 60,
    );
    this.logger.log(`sync programado de recibos cada ${minutos} min`);
    this.timer = setInterval(() => void this.runOnce(), minutos * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Una ronda completa; ignora la llamada si la anterior sigue en curso. */
  async runOnce(now: Date = new Date()): Promise<void> {
    if (this.running) {
      this.logger.warn('ronda anterior en curso; se omite esta');
      return;
    }
    this.running = true;
    try {
      const dias = clampInt(
        this.config.get('REPORTES_SYNC_SCHEDULE_WINDOW_DAYS'),
        7,
        1,
        MAX_VENTANA_DIAS,
      );
      const hasta = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const desde = new Date(hasta.getTime() - dias * 24 * 60 * 60 * 1000);

      for (const pasada of PASADAS) {
        try {
          const result = await this.orchestrator.syncEntidadForAllActive(
            'recibos',
            {
              desde,
              hasta,
              refreshScope: true,
              ...(pasada.estado ? { estado: pasada.estado } : {}),
            },
            { ignoreTtl: true },
          );
          this.logger.log(
            `recibos ${pasada.nombre}: ${JSON.stringify({
              filas: result.rowsSynced,
              fallidas: result.failed,
            })}`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`recibos ${pasada.nombre} falló: ${message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
