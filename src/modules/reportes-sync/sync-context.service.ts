import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsurerConnectionService } from './insurers/insurer-connection.service';
import { shouldRefreshScope } from './utils/sync-query.utils';
import { AseguradoraResolverService } from './aseguradora-resolver.service';
import { CATALOG_ENTIDADES } from './utils/sync-catalog.constants';
import { SyncService, type SyncResult } from './sync.service';

export type SyncFiltrosBuilt = Record<string, unknown> & {
  aseguradoraId: number | null;
  desde?: Date;
  hasta?: Date;
  refreshScope: boolean;
  tipoFecha: unknown;
};

@Injectable()
export class SyncContextService {
  private readonly logger = new Logger(SyncContextService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly insurerConnection: InsurerConnectionService,
    private readonly aseguradoraResolver: AseguradoraResolverService,
    private readonly syncService: SyncService,
  ) {}

  isSyncEnabled(): boolean {
    return this.config.get<boolean>('REPORTES_SYNC_ENABLED', false) === true;
  }

  private parseDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value as string | number | Date);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private syncLog(message: string, meta?: Record<string, unknown>): void {
    if (meta && Object.keys(meta).length > 0) {
      this.logger.log(`${message} ${JSON.stringify(meta)}`);
    } else {
      this.logger.log(message);
    }
  }

  async buildSyncFilters(
    body: Record<string, unknown> = {},
    headers: Record<string, unknown> = {},
  ): Promise<SyncFiltrosBuilt> {
    const filtros =
      body.filtros && typeof body.filtros === 'object'
        ? (body.filtros as Record<string, unknown>)
        : {};
    const syncBlock =
      body.sync && typeof body.sync === 'object'
        ? (body.sync as Record<string, unknown>)
        : {};

    const aseguradoraId = await this.aseguradoraResolver.resolveAseguradoraId(
      null,
      body,
      headers,
    );

    const desde = this.parseDate(
      syncBlock.desde ??
        filtros.desde ??
        filtros.fdesdeemi ??
        filtros.fdesdenot ??
        filtros.fdesdeinc ??
        filtros.fecha_desde,
    );

    const hasta = this.parseDate(
      syncBlock.hasta ??
        filtros.hasta ??
        filtros.fhastaemi ??
        filtros.fhastanot ??
        filtros.fhastainc ??
        filtros.fecha_hasta,
    );

    const scopeRefreshAlways =
      this.config.get<string>('REPORTES_SYNC_SCOPE_REFRESH') === 'always';

    return {
      ...filtros,
      aseguradoraId: aseguradoraId ? Number(aseguradoraId) : null,
      desde,
      hasta,
      refreshScope: shouldRefreshScope(
        { desde, hasta },
        { refreshScope: Boolean(syncBlock.refreshScope) },
        scopeRefreshAlways,
      ),
      tipoFecha: filtros.tipoFecha ?? null,
    };
  }

  async maybeSyncBeforeReport(
    entidad: string,
    body: Record<string, unknown>,
    options: Record<string, unknown> = {},
    headers: Record<string, unknown> = {},
  ): Promise<SyncResult | Record<string, unknown>> {
    this.syncLog(`iniciando sync antes de reporte (${entidad})`, {
      force: Boolean(body?.forceSync || (body?.sync as Record<string, unknown>)?.force),
    });

    try {
      if (!this.isSyncEnabled()) {
        const result = { skipped: true, reason: 'REPORTES_SYNC_ENABLED=false' };
        this.syncLog(`${entidad}: omitido (REPORTES_SYNC_ENABLED=false)`);
        return result;
      }

      const filtros = await this.buildSyncFilters(body, headers);
      if (!filtros.aseguradoraId) {
        const active =
          await this.insurerConnection.listActiveConnectionsSafe();
        const result = {
          skipped: true,
          reason: this.aseguradoraResolver.aseguradoraRequiredMessage(
            active.length,
          ),
        };
        this.syncLog(`${entidad}: omitido (${result.reason})`, {
          activeCount: active.length,
        });
        return result;
      }

      this.syncLog(
        `${entidad}: extrayendo origen aseguradora ${filtros.aseguradoraId}`,
        {
          desde: filtros.desde?.toISOString?.() ?? null,
          hasta: filtros.hasta?.toISOString?.() ?? null,
          refreshScope: filtros.refreshScope,
        },
      );
      return this.syncService.syncIncremental(entidad, filtros, {
        force: Boolean(
          body?.forceSync || (body?.sync as Record<string, unknown>)?.force,
        ),
        ...options,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.syncLog(
        `${entidad}: error en sync previo, se continúa con datos locales`,
        { message },
      );
      return {
        skipped: true,
        reason: 'sync_preflight_error',
        error: message,
      };
    }
  }

  /**
   * Sync de catálogos al ABRIR el reporte (getFiltros / meta).
   * No usar en execute/consulta: respeta TTL (REPORTES_SYNC_CATALOG_TTL_SECONDS).
   */
  async maybeSyncCatalogsOnOpen(
    body: Record<string, unknown> = {},
    headers: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    this.syncLog('iniciando sync de catálogos al abrir reporte');

    try {
      if (!this.isSyncEnabled()) {
        return {
          skipped: true,
          reason: 'REPORTES_SYNC_ENABLED=false',
          catalogs: [],
        };
      }

      const filtros = await this.buildSyncFilters(body, headers);
      if (!filtros.aseguradoraId) {
        const active =
          await this.insurerConnection.listActiveConnectionsSafe();
        return {
          skipped: true,
          reason: this.aseguradoraResolver.aseguradoraRequiredMessage(
            active.length,
          ),
          catalogs: [],
        };
      }

      const force = Boolean(
        body?.forceSync || (body?.sync as Record<string, unknown>)?.force,
      );
      const catalogs = await Promise.all(
        CATALOG_ENTIDADES.map((entidad) =>
          this.syncService.syncIncremental(entidad, filtros, {
            force,
            catalog: true,
            skipDelete: true,
          }),
        ),
      );

      return {
        skipped: false,
        aseguradoraId: filtros.aseguradoraId,
        catalogs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.syncLog(
        'catálogos: error en sync al abrir, se continúa con datos locales',
        { message },
      );
      return {
        skipped: true,
        reason: 'sync_catalog_preflight_error',
        error: message,
        catalogs: [],
      };
    }
  }

  /**
   * Sync al ABRIR el reporte (getFiltros): catálogos + entidad transaccional.
   */
  async maybeSyncReportOnOpen(
    entidad: string | null | undefined,
    body: Record<string, unknown> = {},
    headers: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const catalogs = await this.maybeSyncCatalogsOnOpen(body, headers);

    if (
      !entidad ||
      (catalogs.skipped && catalogs.reason && !catalogs.aseguradoraId)
    ) {
      return { ...catalogs, entity: null };
    }

    const entityResult = await this.maybeSyncBeforeReport(
      entidad,
      body,
      {
        skipDelete: true,
        force: Boolean(
          body?.forceSync || (body?.sync as Record<string, unknown>)?.force,
        ),
      },
      headers,
    );

    return {
      skipped: false,
      aseguradoraId:
        catalogs.aseguradoraId ||
        (entityResult as SyncResult)?.aseguradoraId ||
        null,
      catalogs: catalogs.catalogs || [],
      entity: entityResult,
    };
  }
}
