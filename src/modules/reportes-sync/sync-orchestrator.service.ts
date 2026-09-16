import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsurerConnectionService } from './insurers/insurer-connection.service';
import { SyncService } from './sync.service';
import { CATALOG_ENTIDADES } from './utils/sync-catalog.constants';

const VALID_ENTIDADES = new Set([
  'recibos',
  'siniestros',
  'polizas',
  ...CATALOG_ENTIDADES,
]);

@Injectable()
export class SyncOrchestratorService {
  private readonly logger = new Logger(SyncOrchestratorService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly insurerConnection: InsurerConnectionService,
    private readonly syncService: SyncService,
  ) {}

  getMaxConcurrentOrigins(): number {
    const value = Number(
      this.config.get<number>('REPORTES_SYNC_MAX_CONCURRENT_ORIGINS', 2),
    );
    return Number.isFinite(value) && value > 0 ? value : 2;
  }

  private async runWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function runner(): Promise<void> {
      while (nextIndex < items.length) {
        const current = nextIndex;
        nextIndex += 1;
        results[current] = await worker(items[current], current);
      }
    }

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      () => runner(),
    );
    await Promise.all(workers);
    return results;
  }

  private assertEntidad(entidad: string): void {
    if (!VALID_ENTIDADES.has(entidad)) {
      throw new Error(
        `Entidad no soportada: ${entidad}. Use: recibos, siniestros, polizas, ramos, canales, productores, anulaciones, rechazos`,
      );
    }
  }

  /**
   * Sincroniza una entidad para todas las aseguradoras activas en paralelo (con límite).
   */
  async syncEntidadForAllActive(
    entidad: string,
    filtrosBase: Record<string, unknown> = {},
    options: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    this.assertEntidad(entidad);

    if (!this.config.get<boolean>('REPORTES_SYNC_ENABLED', false)) {
      return {
        entidad,
        total: 0,
        results: [],
        skipped: true,
        reason: 'REPORTES_SYNC_ENABLED=false',
      };
    }

    const insurers = await this.insurerConnection.listActiveConnections();
    if (insurers.length === 0) {
      return {
        entidad,
        total: 0,
        results: [],
        skipped: true,
        reason: 'Sin aseguradoras activas',
      };
    }

    const limit = this.getMaxConcurrentOrigins();
    this.logger.log(
      `${entidad}: sync paralelo para ${insurers.length} origen(es), concurrencia=${limit}`,
    );

    const results = await this.runWithConcurrencyLimit(
      insurers,
      limit,
      async (insurer) => {
        try {
          const result = await this.syncService.syncIncremental(
            entidad,
            { ...filtrosBase, aseguradoraId: Number(insurer.id) },
            options,
          );
          return {
            aseguradoraId: insurer.id,
            codigo: insurer.codigo,
            nombre: insurer.nombre,
            ok: !result.stale && !result.warning?.includes('falló'),
            ...result,
          };
        } catch (error) {
          return {
            aseguradoraId: insurer.id,
            codigo: insurer.codigo,
            nombre: insurer.nombre,
            ok: false,
            entidad,
            rowsSynced: 0,
            skipped: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );

    const synced = results.reduce(
      (sum, row) => sum + (Number(row.rowsSynced) || 0),
      0,
    );
    const failed = results.filter(
      (row) =>
        row.ok === false || ('stale' in row && Boolean(row.stale)),
    ).length;

    return {
      entidad,
      total: insurers.length,
      rowsSynced: synced,
      failed,
      results,
    };
  }

  /**
   * Health check de conexión para todas las aseguradoras activas.
   */
  async healthCheckAllActive(): Promise<Record<string, unknown>> {
    const insurers = await this.insurerConnection.listActiveConnections();
    const limit = this.getMaxConcurrentOrigins();

    const results = await this.runWithConcurrencyLimit(
      insurers,
      limit,
      async (insurer) => {
        const connection = await this.insurerConnection.healthCheck(
          Number(insurer.id),
        );
        return {
          aseguradoraId: insurer.id,
          codigo: insurer.codigo,
          nombre: insurer.nombre,
          tipoDb: insurer.tipo_db,
          adapterCodigo: insurer.adapter_codigo,
          connection,
        };
      },
    );

    return {
      total: insurers.length,
      ok: results.filter((row) => row.connection?.ok).length,
      results,
    };
  }
}
