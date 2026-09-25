import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsurerConnectionService } from './insurers/insurer-connection.service';
import { InsurerAdapterFactory } from './insurers/adapters/insurer-adapter.factory';
import { SyncWatermarkRepository } from './repositories/sync-watermark.repository';
import { SyncLockService } from './utils/sync-lock.service';
import { SyncUpsertRepository } from './repositories/sync-upsert.repository';
import { SyncLocalRepository } from './repositories/sync-local.repository';
import { isCatalogEntidad } from './utils/sync-catalog.constants';
import { mapRowFromConfig } from './insurers/mapping/column-mapper';
import type {
  InsurerAdapter,
  InsurerConnectionConfig,
} from './insurers/adapters/insurer-adapter.types';
import type { ExtractionPlan } from './insurers/extraction/extraction.planner';

export type SyncResult = {
  entidad: string;
  rowsSynced: number;
  skipped: boolean;
  stale?: boolean;
  reason?: string;
  warning?: string;
  refreshScope?: boolean;
  fullResync?: boolean;
  durationMs: number;
  aseguradoraId?: number;
};

type SyncFiltros = Record<string, unknown> & {
  aseguradoraId?: number | null;
  desde?: Date;
  hasta?: Date;
  refreshScope?: boolean;
  fullResync?: boolean;
};

type SyncOptions = {
  force?: boolean;
  catalog?: boolean;
  skipDelete?: boolean;
  ignoreTtl?: boolean;
  /** Si hay datos locales, no bloquear el reporte con un full-resync (salvo force). */
  preferLocal?: boolean;
};

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  private readonly upsertHandlers: Record<
    string,
    (aseguradoraId: number, row: Record<string, unknown>) => Promise<void>
  >;

  constructor(
    private readonly config: ConfigService,
    private readonly insurerConnection: InsurerConnectionService,
    private readonly adapterFactory: InsurerAdapterFactory,
    private readonly watermarkRepo: SyncWatermarkRepository,
    private readonly syncLock: SyncLockService,
    private readonly upsertRepo: SyncUpsertRepository,
    private readonly localRepo: SyncLocalRepository,
  ) {
    this.upsertHandlers = {
      recibos: (id, row) => this.upsertRepo.upsertRecibo(id, row),
      siniestros: (id, row) => this.upsertRepo.upsertSiniestro(id, row),
      polizas: (id, row) => this.upsertRepo.upsertPoliza(id, row),
      ramos: (id, row) => this.upsertRepo.upsertRamo(id, row),
      canales: (id, row) => this.upsertRepo.upsertCanal(id, row),
      productores: (id, row) => this.upsertRepo.upsertProductor(id, row),
      anulaciones: (id, row) => this.upsertRepo.upsertAnulacion(id, row),
      rechazos: (id, row) => this.upsertRepo.upsertRechazo(id, row),
    };
  }

  private isSyncEnabled(): boolean {
    return this.config.get<boolean>('REPORTES_SYNC_ENABLED', false) === true;
  }

  private getTtlMs(entidad: string): number {
    if (isCatalogEntidad(entidad)) {
      return (
        Number(
          this.config.get<number>('REPORTES_SYNC_CATALOG_TTL_SECONDS', 3600),
        ) * 1000
      );
    }
    return (
      Number(this.config.get<number>('REPORTES_SYNC_TTL_SECONDS', 120)) * 1000
    );
  }

  private getBatchSize(): number {
    return Number(this.config.get<number>('REPORTES_SYNC_BATCH_SIZE', 1000));
  }

  private formatOriginLabel(
    config: InsurerConnectionConfig | null | undefined,
    plan: ExtractionPlan | undefined,
  ): string {
    if (!config && !plan) return 'origen desconocido';
    if (plan?.source === 'api') {
      return plan.originConfig?.apiUrl || 'API';
    }
    if (config?.host) {
      const db = config.databaseName ? `/${config.databaseName}` : '';
      return `${config.host}${db}`;
    }
    return 'origen desconocido';
  }

  private syncLog(message: string, meta?: Record<string, unknown>): void {
    if (meta && Object.keys(meta).length > 0) {
      this.logger.log(`${message} ${JSON.stringify(meta)}`);
    } else {
      this.logger.log(message);
    }
  }

  private logSyncResult(
    result: SyncResult,
    context: Record<string, unknown> = {},
  ): void {
    const durationSec = ((result.durationMs || 0) / 1000).toFixed(1);
    const origin = (context.origin as string) || '—';

    if (result.skipped) {
      const reason = result.warning || result.reason || 'TTL activo o sync omitido';
      this.syncLog(`${result.entidad}: omitido (${reason})`, {
        aseguradoraId: context.aseguradoraId,
        durationMs: result.durationMs,
      });
      return;
    }

    if (result.stale) {
      this.syncLog(
        `${result.entidad}: falló origen ${origin} → usando PostgreSQL local (${durationSec}s)`,
        { warning: result.warning, aseguradoraId: context.aseguradoraId },
      );
      return;
    }

    const mode = context.extractMode ? ` [${context.extractMode}]` : '';
    const scope = context.refreshScope ? ' (alcance completo)' : '';
    const full = context.fullResync ? ' (carga completa)' : '';
    this.syncLog(
      `${result.entidad}: ${result.rowsSynced} filas desde ${origin}${mode}${scope}${full} → PostgreSQL (${durationSec}s)`,
      {
        aseguradoraId: context.aseguradoraId,
        rowsRead: context.rowsRead,
        rowsSynced: result.rowsSynced,
      },
    );
  }

  private mapRowForSync(
    entidad: string,
    row: Record<string, unknown>,
    adapter: InsurerAdapter,
    connectionConfig: InsurerConnectionConfig,
  ): Record<string, unknown> {
    const entityConfig = connectionConfig?.origenConfig?.[entidad] || {};
    const columnMap =
      (entityConfig.columnMap as Record<string, unknown>) ||
      (entityConfig.mapeo_columnas as Record<string, unknown>);
    if (
      columnMap &&
      typeof columnMap === 'object' &&
      Object.keys(columnMap).length > 0
    ) {
      return mapRowFromConfig(entidad, row, entityConfig);
    }
    return adapter.mapRow(entidad, row, connectionConfig);
  }

  private normalizeCatalogMapped(
    mapped: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!mapped) return mapped;
    const id = mapped.id ?? mapped.codigo ?? null;
    if (id == null) return mapped;
    return {
      ...mapped,
      id,
      origenClave: mapped.origenClave || String(id),
      descripcion: mapped.descripcion ?? mapped.nombre ?? null,
    };
  }

  private async upsertBatch(
    entidad: string,
    aseguradoraId: number,
    adapter: InsurerAdapter,
    batch: Record<string, unknown>[],
    connectionConfig: InsurerConnectionConfig,
  ): Promise<number> {
    const mappedRows: Record<string, unknown>[] = [];
    for (const row of batch) {
      let mapped = this.mapRowForSync(entidad, row, adapter, connectionConfig);
      if (isCatalogEntidad(entidad)) {
        mapped = this.normalizeCatalogMapped(mapped);
      }
      if (!mapped.origenClave && !mapped.origenId && mapped.id == null) continue;
      mappedRows.push(mapped);
    }

    if (mappedRows.length === 0) return 0;

    if (entidad === 'recibos') {
      await this.upsertRepo.insertRecibosBatch(aseguradoraId, mappedRows);
      return mappedRows.length;
    }

    const upsert = this.upsertHandlers[entidad];
    if (!upsert) throw new Error(`Entidad de sync no soportada: ${entidad}`);

    await Promise.all(
      mappedRows.map((mapped) => upsert(aseguradoraId, mapped)),
    );
    return mappedRows.length;
  }

  private collectOrigenClaves(
    entidad: string,
    rows: Record<string, unknown>[],
    adapter: InsurerAdapter,
    connectionConfig: InsurerConnectionConfig,
  ): string[] {
    const claves: string[] = [];
    for (const row of rows) {
      let mapped = this.mapRowForSync(entidad, row, adapter, connectionConfig);
      if (isCatalogEntidad(entidad)) {
        mapped = this.normalizeCatalogMapped(mapped);
      }
      const clave = mapped.origenClave;
      if (clave != null && String(clave).trim() !== '') {
        claves.push(String(clave));
      }
    }
    return claves;
  }

  private dedupeRowsByOrigenClave(
    entidad: string,
    rows: Record<string, unknown>[],
    adapter: InsurerAdapter,
    connectionConfig: InsurerConnectionConfig,
  ): Record<string, unknown>[] {
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    // Última aparición gana (mismo orden que un reload completo).
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      let mapped = this.mapRowForSync(entidad, row, adapter, connectionConfig);
      if (isCatalogEntidad(entidad)) {
        mapped = this.normalizeCatalogMapped(mapped);
      }
      const clave =
        mapped.origenClave != null ? String(mapped.origenClave).trim() : '';
      if (!clave) {
        out.push(row);
        continue;
      }
      if (seen.has(clave)) continue;
      seen.add(clave);
      out.push(row);
    }
    return out.reverse();
  }

  private trackMaxModified(
    batch: Record<string, unknown>[],
    adapter: InsurerAdapter,
    entidad: string,
    currentMax: Date | null,
    connectionConfig: InsurerConnectionConfig,
  ): Date | null {
    let maxModifiedAt = currentMax;
    const nowWithBuffer = new Date(Date.now() + 24 * 60 * 60 * 1000);
    for (const row of batch) {
      let mapped = this.mapRowForSync(entidad, row, adapter, connectionConfig);
      if (isCatalogEntidad(entidad)) {
        mapped = this.normalizeCatalogMapped(mapped);
      }
      const candidate = mapped.origenModifiedAt;
      if (
        candidate instanceof Date &&
        candidate <= nowWithBuffer
      ) {
        if (!maxModifiedAt || candidate > maxModifiedAt) {
          maxModifiedAt = candidate;
        }
      }
    }
    return maxModifiedAt;
  }

  async syncIncremental(
    entidad: string,
    filtros: SyncFiltros,
    options: SyncOptions = {},
  ): Promise<SyncResult> {
    const started = Date.now();

    if (!this.isSyncEnabled()) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        reason: 'REPORTES_SYNC_ENABLED=false',
        durationMs: Date.now() - started,
      };
      this.logSyncResult(result);
      return result;
    }

    const { aseguradoraId } = filtros;
    const catalog = isCatalogEntidad(entidad) || options.catalog === true;
    // Recibos: siempre DELETE en PG destino + INSERT (nunca upsert/skipDelete).
    const skipDelete =
      catalog || (entidad !== 'recibos' && options.skipDelete === true);

    if (!aseguradoraId) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        warning: 'aseguradoraId requerido para sincronizar',
        durationMs: Date.now() - started,
      };
      this.logSyncResult(result, { aseguradoraId });
      return result;
    }

    if (!this.upsertHandlers[entidad]) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        warning: `Entidad no soportada: ${entidad}`,
        durationMs: Date.now() - started,
      };
      this.logSyncResult(result, { aseguradoraId });
      return result;
    }

    const connectionConfig =
      await this.insurerConnection.getConnectionConfig(aseguradoraId);
    if (!connectionConfig?.origenConfig?.[entidad]) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        warning: `origen_config.${entidad} no configurado`,
        durationMs: Date.now() - started,
      };
      this.logSyncResult(result, { aseguradoraId });
      return result;
    }

    const watermark = await this.watermarkRepo.getWatermark(
      aseguradoraId,
      entidad,
    );
    const localCount = await this.localRepo.countLocalRows(
      aseguradoraId,
      entidad,
    );
    const needsFullLoad = localCount === 0 || options.force;
    const lastRunAt = watermark?.last_run_at
      ? new Date(watermark.last_run_at as string | Date)
      : null;
    const configModifiedAt = connectionConfig?.modifiedAt
      ? new Date(connectionConfig.modifiedAt)
      : null;
    const configChangedAfterLastRun = Boolean(
      configModifiedAt &&
        Number.isFinite(configModifiedAt.getTime()) &&
        (!lastRunAt || configModifiedAt.getTime() > lastRunAt.getTime()),
    );

    const lastError =
      (watermark?.last_error as string) ||
      (watermark?.lastError as string) ||
      null;

    // Execute/consulta: priorizar datos ya cargados; forceSync refresca desde origen.
    if (options.preferLocal && !options.force && localCount > 0) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        reason: 'datos locales (forceSync para refrescar)',
        durationMs: Date.now() - started,
        aseguradoraId,
      };
      this.logSyncResult(result, {
        aseguradoraId,
        origin: 'preferLocal',
        localCount,
      });
      return result;
    }

    if (
      !options.ignoreTtl &&
      !needsFullLoad &&
      !lastError &&
      lastRunAt &&
      Date.now() - lastRunAt.getTime() < this.getTtlMs(entidad) &&
      !configChangedAfterLastRun
    ) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        reason: 'TTL activo',
        durationMs: Date.now() - started,
      };
      this.logSyncResult(result, {
        aseguradoraId,
        origin: 'TTL cache',
      });
      return result;
    }

    const acquired = await this.syncLock.tryAcquire(aseguradoraId, entidad);
    if (!acquired) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        warning: 'Sincronización en curso por otro proceso',
        durationMs: Date.now() - started,
      };
      this.logSyncResult(result, { aseguradoraId });
      return result;
    }

    let plan: ExtractionPlan | undefined;
    try {
      const adapter = this.adapterFactory.getAdapter(
        connectionConfig.adapterCodigo,
        connectionConfig.tipoDb,
      );
      const syncFiltros: SyncFiltros = { ...filtros };

      let watermarkDate: Date | null = null;
      if (catalog) {
        syncFiltros.fullResync = true;
        watermarkDate = null;
        this.syncLog(
          `${entidad}: sincronizando catálogo (upsert, sin delete) → PostgreSQL`,
          { aseguradoraId },
        );
      } else if (skipDelete) {
        watermarkDate = needsFullLoad
          ? null
          : watermark?.last_modified_at
            ? new Date(watermark.last_modified_at as string | Date)
            : null;
        syncFiltros.fullResync = Boolean(needsFullLoad || options.force);
        this.syncLog(
          `${entidad}: sync incremental sin vaciar local → PostgreSQL`,
          { aseguradoraId },
        );
      } else {
        watermarkDate = null;
        syncFiltros.fullResync = true;
        this.syncLog(
          `${entidad}: DELETE en PG destino + INSERT (origen solo lectura) → rango completo`,
          { aseguradoraId },
        );
      }

      plan = adapter.planEntityExtraction(
        entidad,
        watermarkDate,
        syncFiltros,
        connectionConfig.schemaOrigen,
        connectionConfig.tipoDb,
        connectionConfig,
      );

      const rows =
        plan.source === 'api'
          ? await this.insurerConnection.fetchFromApi(
              plan.originConfig,
              watermarkDate,
              syncFiltros,
            )
          : await this.insurerConnection.querySource(
              aseguradoraId,
              plan.query,
              plan.params,
            );

      if (!skipDelete) {
        this.syncLog(
          `${entidad}: borrando en PG destino (aseguradora ${aseguradoraId}, rango fechas); origen no se toca`,
        );
        await this.localRepo.deleteLocalRows(
          aseguradoraId,
          entidad,
          filtros.desde,
          filtros.hasta,
        );
      }

      // Recibos: también borrar por origen_clave del extract (el filtro puede usar
      // fecha_pago/desde/hasta ≠ fecha_emision del DELETE por rango).
      if (entidad === 'recibos' && !catalog) {
        const claves = this.collectOrigenClaves(
          entidad,
          rows,
          adapter,
          connectionConfig,
        );
        if (claves.length > 0) {
          this.syncLog(
            `${entidad}: borrando ${claves.length} claves de origen en PG destino antes de INSERT`,
          );
          await this.localRepo.deleteByOrigenClaves(
            aseguradoraId,
            entidad,
            claves,
          );
        }
      }

      let rowsSynced = 0;
      let maxModifiedAt: Date | null = null;

      const batchSize = this.getBatchSize();
      const rowsToWrite =
        entidad === 'recibos'
          ? this.dedupeRowsByOrigenClave(
              entidad,
              rows,
              adapter,
              connectionConfig,
            )
          : rows;

      for (let i = 0; i < rowsToWrite.length; i += batchSize) {
        const batch = rowsToWrite.slice(i, i + batchSize);
        rowsSynced += await this.upsertBatch(
          entidad,
          aseguradoraId,
          adapter,
          batch,
          connectionConfig,
        );
        maxModifiedAt = this.trackMaxModified(
          batch,
          adapter,
          entidad,
          maxModifiedAt,
          connectionConfig,
        );
      }

      await this.watermarkRepo.upsertWatermark(aseguradoraId, entidad, {
        lastModifiedAt: maxModifiedAt,
        lastRunAt: new Date(),
        rowsSynced,
        lastError: null,
      });

      const result: SyncResult = {
        entidad,
        rowsSynced,
        skipped: false,
        refreshScope: Boolean(filtros.refreshScope),
        fullResync: Boolean(syncFiltros.fullResync),
        durationMs: Date.now() - started,
        aseguradoraId,
      };
      this.logSyncResult(result, {
        aseguradoraId,
        origin: this.formatOriginLabel(connectionConfig, plan),
        extractMode: plan.originConfig?.mode || plan.source,
        refreshScope: filtros.refreshScope,
        fullResync: syncFiltros.fullResync,
        rowsRead: rows.length,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.watermarkRepo.upsertWatermark(aseguradoraId, entidad, {
        lastModifiedAt: watermark?.last_modified_at
          ? new Date(watermark.last_modified_at as string | Date)
          : null,
        lastRunAt: watermark?.last_run_at
          ? new Date(watermark.last_run_at as string | Date)
          : null,
        rowsSynced: 0,
        lastError: message,
      });

      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: false,
        stale: true,
        warning: `No se pudo sincronizar desde el origen (${message}). Se usan datos locales.`,
        durationMs: Date.now() - started,
        aseguradoraId,
      };
      this.logSyncResult(result, {
        aseguradoraId,
        origin: connectionConfig
          ? this.formatOriginLabel(connectionConfig, plan)
          : undefined,
      });
      return result;
    } finally {
      await this.syncLock.release(aseguradoraId, entidad);
    }
  }
}
