import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ReportesPgService,
  type PgTransaction,
} from '../../database/reportes-pg.service';
import { InsurerConnectionService } from './insurers/insurer-connection.service';
import { InsurerAdapterFactory } from './insurers/adapters/insurer-adapter.factory';
import { SyncWatermarkRepository } from './repositories/sync-watermark.repository';
import { SyncLockService } from './utils/sync-lock.service';
import { SyncUpsertRepository } from './repositories/sync-upsert.repository';
import {
  SyncLocalRepository,
  type LocalDeleteScope,
} from './repositories/sync-local.repository';
import { isCatalogEntidad } from './utils/sync-catalog.constants';
import { debeFrenarHuerfanas, debeFrenarReemplazo } from './utils/sync-guard';
import { SyncScopeCache } from './utils/sync-scope-cache';
import { partirRango, tramosParaRango } from './utils/sync-range';
import {
  hasExtraOriginFilters,
  resolveDateColumn,
  resolveEstadoLetter,
} from './utils/origin-query.params';
import { mapRowFromConfig } from './insurers/mapping/column-mapper';
import type {
  InsurerAdapter,
  InsurerConnectionConfig,
} from './insurers/adapters/insurer-adapter.types';
import type { ExtractionPlan } from './insurers/extraction/extraction.planner';

/** Entidades cuya escritura va en una sola transacción (los lectores ven siempre un estado completo). */
const ENTIDADES_ATOMICAS = new Set(['recibos', 'siniestros']);

export type SyncResult = {
  entidad: string;
  rowsSynced: number;
  /** Recibos con escritura por diferencias: filas realmente nuevas o modificadas. */
  rowsChanged?: number;
  /** Milisegundos de la lectura en el origen y de la escritura en PG (solo syncs que escriben). */
  extractMs?: number;
  writeMs?: number;
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
  /**
   * Identifica el alcance (filtros del usuario). Con clave, la vigencia es por alcance y no por entidad,
   * y si otro sync tiene el candado se espera en lugar de omitir el refresco.
   */
  scopeKey?: string;
};

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly scopeCache = new SyncScopeCache();

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
    private readonly reportesPg: ReportesPgService,
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

  /**
   * Alcance del DELETE local de recibos: solo cuando el extract filtra el rango con el
   * placeholder SYNC_DATE_COL (modo query); en otros modos se conserva el comportamiento previo.
   */
  private buildDeleteScope(
    entidad: string,
    plan: ExtractionPlan | undefined,
    syncFiltros: Record<string, unknown>,
  ): LocalDeleteScope | undefined {
    const originConfig = plan?.originConfig;
    if (entidad !== 'recibos' || !originConfig?.querySql) return undefined;
    if (!originConfig.querySql.includes('/*SYNC_DATE_COL*/')) return undefined;
    return {
      originDateExpr: resolveDateColumn(syncFiltros, originConfig),
      estadoLetter: resolveEstadoLetter(syncFiltros, originConfig),
      skipRangeDelete: hasExtraOriginFilters(syncFiltros, originConfig),
    };
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

  /** Escritura de recibos por diferencias (solo lo nuevo o modificado). Desactivable por si hiciera falta. */
  private isDeltaEnabled(): boolean {
    return this.config.get<boolean>('REPORTES_SYNC_RECIBOS_DELTA', true) !== false;
  }

  /** Vigencia de un alcance ya sincronizado antes de volver a consultar el origen. */
  private getScopeTtlMs(): number {
    return Number(this.config.get<number>('REPORTES_SYNC_SCOPE_TTL_SECONDS', 30)) * 1000;
  }

  /**
   * Conexiones simultáneas para leer un rango ancho de recibos (tramos de fechas). Con 1 se desactiva.
   * El pool del origen admite 5.
   */
  private getExtractParallelism(): number {
    const n = Math.floor(Number(this.config.get<number>('REPORTES_SYNC_EXTRACT_PARALLEL', 4)));
    return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 1;
  }

  /** Espera máxima por el candado cuando la consulta pide su propio alcance. */
  private getLockWaitMs(): number {
    return Number(this.config.get<number>('REPORTES_SYNC_LOCK_WAIT_SECONDS', 45)) * 1000;
  }

  /** Intenta el candado; con espera, reintenta cada 500 ms hasta agotarla. */
  private async acquireSyncLock(
    aseguradoraId: number,
    entidad: string,
    waitMs: number,
  ): Promise<boolean> {
    const limite = Date.now() + Math.max(0, waitMs);
    for (;;) {
      if (await this.syncLock.tryAcquire(aseguradoraId, entidad)) return true;
      if (Date.now() >= limite) return false;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
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
      `${result.entidad}: ${result.rowsSynced} filas desde ${origin}${mode}${scope}${full} → PostgreSQL` +
        `${result.rowsChanged !== undefined ? ` (${result.rowsChanged} nuevas o modificadas)` : ''} (${durationSec}s` +
        `${result.extractMs !== undefined ? `: origen ${(result.extractMs / 1000).toFixed(1)}s, escritura ${((result.writeMs ?? 0) / 1000).toFixed(1)}s` : ''})`,
      {
        aseguradoraId: context.aseguradoraId,
        rowsRead: context.rowsRead,
        rowsSynced: result.rowsSynced,
        rowsChanged: result.rowsChanged,
      },
    );
  }

  private mergeAdapterWithColumnMap(
    fromAdapter: Record<string, unknown>,
    fromConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = { ...fromAdapter };
    for (const [key, value] of Object.entries(fromConfig)) {
      if (value === undefined || value === null) continue;
      if (
        typeof value === 'string' &&
        value.trim() === '' &&
        merged[key] != null &&
        String(merged[key]).trim() !== ''
      ) {
        continue;
      }
      merged[key] = value;
    }
    return merged;
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
    const fromAdapter = adapter.mapRow(entidad, row, connectionConfig);
    if (
      columnMap &&
      typeof columnMap === 'object' &&
      Object.keys(columnMap).length > 0
    ) {
      const fromConfig = mapRowFromConfig(entidad, row, entityConfig);
      return this.mergeAdapterWithColumnMap(fromAdapter, fromConfig);
    }
    return fromAdapter;
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
    tx?: PgTransaction,
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
      await this.upsertRepo.insertRecibosBatch(aseguradoraId, mappedRows, tx);
      return mappedRows.length;
    }

    if (entidad === 'siniestros') {
      await this.upsertRepo.upsertSiniestrosBatch(aseguradoraId, mappedRows, tx);
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

  /**
   * Lectura del origen. Entregar las filas al API es lo que más tarda (el servidor resuelve los joins en una
   * fracción de segundo), así que un rango ancho de recibos se parte en tramos de fechas consecutivos que se
   * leen en paralelo por conexiones distintas. Mismo resultado: los tramos son disjuntos y cubren el rango.
   */
  private async extractFromSource(args: {
    aseguradoraId: number;
    entidad: string;
    adapter: InsurerAdapter;
    plan: ExtractionPlan;
    watermarkDate: Date | null;
    syncFiltros: SyncFiltros;
    connectionConfig: InsurerConnectionConfig;
  }) {
    const { aseguradoraId, entidad, adapter, plan, watermarkDate, syncFiltros, connectionConfig } = args;
    if (plan.source === 'api') throw new Error('extractFromSource no aplica a orígenes por API');
    const esQueryConRango =
      entidad === 'recibos' && Boolean(plan.originConfig?.querySql?.includes('/*SYNC_DATE_COL*/'));
    const tramos = esQueryConRango
      ? tramosParaRango(syncFiltros.desde, syncFiltros.hasta, this.getExtractParallelism())
      : 1;

    if (tramos <= 1 || !syncFiltros.desde || !syncFiltros.hasta) {
      return this.insurerConnection.querySource(aseguradoraId, plan.query, plan.params);
    }

    const rangos = partirRango(syncFiltros.desde, syncFiltros.hasta, tramos);
    const planes = rangos.map((rango) => {
      const sub = adapter.planEntityExtraction(
        entidad,
        watermarkDate,
        { ...syncFiltros, desde: rango.desde, hasta: rango.hasta },
        connectionConfig.schemaOrigen,
        connectionConfig.tipoDb,
        connectionConfig,
      );
      if (sub.source === 'api') throw new Error('extractFromSource no aplica a orígenes por API');
      return sub;
    });
    this.syncLog(`${entidad}: leyendo el origen en ${planes.length} tramos de fechas en paralelo`, { aseguradoraId });
    const partes = await Promise.all(
      planes.map((p) => this.insurerConnection.querySource(aseguradoraId, p.query, p.params)),
    );
    return partes.flat();
  }

  /**
   * Recibos, escritura por diferencias (dentro de la transacción del sync):
   *  1. Inserta lo nuevo y actualiza SOLO lo que cambió (las filas idénticas no se escriben).
   *  2. Borra las filas del alcance cuya clave ya no vino del origen (recibos eliminados o fuera del rango),
   *     con freno de seguridad si fueran más que las recibidas.
   * Mismo resultado final que borrar el rango e insertar todo, con una fracción de la escritura.
   */
  private async writeRecibosDelta(args: {
    aseguradoraId: number;
    rows: Record<string, unknown>[];
    adapter: InsurerAdapter;
    connectionConfig: InsurerConnectionConfig;
    filtros: SyncFiltros;
    syncFiltros: SyncFiltros;
    plan: ExtractionPlan | undefined;
    tx?: PgTransaction;
  }): Promise<{ rowsSynced: number; maxModifiedAt: Date | null; rowsChanged: number }> {
    const { aseguradoraId, rows, adapter, connectionConfig, filtros, syncFiltros, plan, tx } = args;

    // Cada fila se transforma UNA sola vez; antes se repetía en deduplicar, insertar, recolectar claves
    // y calcular la fecha máxima (con 16.000 filas eso eran ~8 s de CPU, más que la propia escritura).
    const t0 = Date.now();
    const mapeadas = rows.map((row) => this.mapRowForSync('recibos', row, adapter, connectionConfig));

    // Una fila por clave de origen (la última aparición gana). Sin clave no hay forma de identificarla:
    // ON CONFLICT no aplicaría y se duplicaría en cada sync.
    const vistas = new Set<string>();
    const unicas: Record<string, unknown>[] = [];
    for (let i = mapeadas.length - 1; i >= 0; i -= 1) {
      const m = mapeadas[i];
      const clave = m.origenClave != null ? String(m.origenClave).trim() : '';
      if (!clave || vistas.has(clave)) continue;
      vistas.add(clave);
      unicas.push(m);
    }
    unicas.reverse();

    const limiteFecha = new Date(Date.now() + 24 * 60 * 60 * 1000);
    let maxModified: Date | null = null;
    for (const m of unicas) {
      const candidata = m.origenModifiedAt;
      if (candidata instanceof Date && candidata <= limiteFecha && (!maxModified || candidata > maxModified)) {
        maxModified = candidata;
      }
    }
    const tPreparar = Date.now() - t0;

    const batchSize = this.getBatchSize();
    let cambiadas = 0;
    for (let i = 0; i < unicas.length; i += batchSize) {
      cambiadas += await this.upsertRepo.upsertRecibosChangedBatch(
        aseguradoraId,
        unicas.slice(i, i + batchSize),
        tx,
      );
    }
    const tUpsert = Date.now() - t0 - tPreparar;

    const claves = unicas.map((m) => String(m.origenClave));
    const scope = this.buildDeleteScope('recibos', plan, syncFiltros);
    const tPurga0 = Date.now();
    let huerfanas = 0;
    if (!scope?.skipRangeDelete) {
      huerfanas = await this.localRepo.deleteScopeNotIn(
        aseguradoraId,
        'recibos',
        claves,
        filtros.desde,
        filtros.hasta,
        scope,
        tx,
      );
      if (debeFrenarHuerfanas({ huerfanas, recibidas: claves.length })) {
        throw new Error(
          `recibos: se borrarían ${huerfanas} filas del alcance y el origen devolvió ${claves.length}; se revierte para no perder datos`,
        );
      }
    }
    this.syncLog(
      `recibos: ${unicas.length} leídas, ${cambiadas} nuevas o modificadas, ${huerfanas} eliminadas del alcance`,
      {
        aseguradoraId,
        msPreparar: tPreparar,
        msUpsert: tUpsert,
        msPurga: Date.now() - tPurga0,
      },
    );
    return { rowsSynced: unicas.length, maxModifiedAt: maxModified, rowsChanged: cambiadas };
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
    if (options.preferLocal && !options.force && !options.scopeKey && localCount > 0) {
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

    // Con alcance (consulta del usuario) la vigencia es por filtros, no por entidad: otro usuario, o el
    // refresco programado, sincronizando OTRO rango no debe dejar sin refrescar el rango que se pide.
    if (
      options.scopeKey &&
      !options.force &&
      this.scopeCache.isFresh(options.scopeKey, this.getScopeTtlMs())
    ) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        reason: `alcance sincronizado hace ${Math.round((this.scopeCache.ageMs(options.scopeKey) ?? 0) / 1000)}s`,
        durationMs: Date.now() - started,
        aseguradoraId,
      };
      this.logSyncResult(result, { aseguradoraId, origin: 'TTL por alcance' });
      return result;
    }

    if (
      !options.ignoreTtl &&
      !options.scopeKey &&
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

    // Consulta con alcance propio: espera a que termine el sync en curso (otro usuario o el programado)
    // y luego refresca su rango, en vez de responder con datos locales sin refrescar.
    const waitMs = options.scopeKey && !options.force ? this.getLockWaitMs() : 0;
    const acquired = await this.acquireSyncLock(aseguradoraId, entidad, waitMs);
    if (!acquired) {
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        // El reporte seguirá con los datos locales vigentes (consistentes: la escritura
        // de recibos es transaccional) pero pueden no incluir el sync en curso.
        stale: true,
        warning: 'Sincronización en curso por otro proceso',
        durationMs: Date.now() - started,
      };
      this.logSyncResult(result, { aseguradoraId });
      return result;
    }

    // Tras esperar, otra consulta con los mismos filtros pudo haber sincronizado ya este alcance.
    if (
      options.scopeKey &&
      !options.force &&
      waitMs > 0 &&
      this.scopeCache.isFresh(options.scopeKey, this.getScopeTtlMs())
    ) {
      await this.syncLock.release(aseguradoraId, entidad);
      const result: SyncResult = {
        entidad,
        rowsSynced: 0,
        skipped: true,
        reason: 'alcance sincronizado por otra consulta mientras se esperaba',
        durationMs: Date.now() - started,
        aseguradoraId,
      };
      this.logSyncResult(result, { aseguradoraId, origin: 'TTL por alcance' });
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

      const tExtract = Date.now();
      const rows =
        plan.source === 'api'
          ? await this.insurerConnection.fetchFromApi(
              plan.originConfig,
              watermarkDate,
              syncFiltros,
            )
          : await this.extractFromSource({
              aseguradoraId,
              entidad,
              adapter,
              plan,
              watermarkDate,
              syncFiltros,
              connectionConfig,
            });

      const extractMs = Date.now() - tExtract;

      // Escritura en PG destino. Para recibos va en UNA transacción (DELETE + INSERT):
      // los lectores concurrentes (otro usuario ejecutando el reporte) ven el estado
      // anterior completo hasta el COMMIT, nunca un rango a medias.
      const writeTarget = async (tx?: PgTransaction) => {
        if (entidad === 'recibos' && !catalog && this.isDeltaEnabled()) {
          return this.writeRecibosDelta({
            aseguradoraId,
            rows,
            adapter,
            connectionConfig,
            filtros,
            syncFiltros,
            plan,
            tx,
          });
        }
        let borradas = 0;
        if (!skipDelete) {
          this.syncLog(
            `${entidad}: borrando en PG destino (aseguradora ${aseguradoraId}, rango fechas); origen no se toca`,
          );
          borradas = await this.localRepo.deleteLocalRows(
            aseguradoraId,
            entidad,
            filtros.desde,
            filtros.hasta,
            this.buildDeleteScope(entidad, plan, syncFiltros),
            tx,
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
              tx,
            );
          }
        }

        let written = 0;
        let maxModified: Date | null = null;

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
          written += await this.upsertBatch(
            entidad,
            aseguradoraId,
            adapter,
            batch,
            connectionConfig,
            tx,
          );
          maxModified = this.trackMaxModified(
            batch,
            adapter,
            entidad,
            maxModified,
            connectionConfig,
          );
        }
        // Freno de seguridad del reemplazo COMPLETO (sin rango): si entra menos de la mitad de lo
        // que se borró (p. ej. el origen devolvió casi nada), se revierte y se deja el estado anterior.
        if (
          tx &&
          debeFrenarReemplazo({
            borradas,
            escritas: written,
            reemplazoCompleto: !filtros.desde && !filtros.hasta,
            sinBorrado: skipDelete,
          })
        ) {
          throw new Error(
            `${entidad}: el reemplazo completo borraría ${borradas} filas y solo insertaría ${written}; se revierte para no perder datos`,
          );
        }
        return { rowsSynced: written, maxModifiedAt: maxModified, rowsChanged: undefined };
      };

      const tWrite = Date.now();
      const { rowsSynced, maxModifiedAt, rowsChanged } =
        ENTIDADES_ATOMICAS.has(entidad) && !catalog
          ? await this.reportesPg.runInTransaction((tx) => writeTarget(tx))
          : await writeTarget();

      const writeMs = Date.now() - tWrite;

      await this.watermarkRepo.upsertWatermark(aseguradoraId, entidad, {
        lastModifiedAt: maxModifiedAt,
        lastRunAt: new Date(),
        rowsSynced,
        lastError: null,
      });
      if (options.scopeKey) this.scopeCache.mark(options.scopeKey);

      const result: SyncResult = {
        entidad,
        rowsSynced,
        rowsChanged,
        extractMs,
        writeMs,
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
