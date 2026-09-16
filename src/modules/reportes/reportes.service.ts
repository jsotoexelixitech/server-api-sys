import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../database/reportes-pg.service';
import { AseguradoraResolverService } from '../reportes-sync/aseguradora-resolver.service';
import { InsurerConnectionService } from '../reportes-sync/insurers/insurer-connection.service';
import { SyncWatermarkRepository } from '../reportes-sync/repositories/sync-watermark.repository';
import { SyncContextService } from '../reportes-sync/sync-context.service';
import { SyncOrchestratorService } from '../reportes-sync/sync-orchestrator.service';
import { SyncService } from '../reportes-sync/sync.service';
import { assertQueryResult } from '../reportes-sync/utils/sync.helpers';
import type { PolizasQueryDto } from './dto/polizas-query.dto';
import type { RunSyncDto } from './dto/run-sync.dto';

@Injectable()
export class ReportesService {
  constructor(
    private readonly reportesPg: ReportesPgService,
    private readonly insurerConnection: InsurerConnectionService,
    private readonly syncService: SyncService,
    private readonly syncOrchestrator: SyncOrchestratorService,
    private readonly syncContext: SyncContextService,
    private readonly aseguradoraResolver: AseguradoraResolverService,
    private readonly watermarkRepo: SyncWatermarkRepository,
  ) {}

  private async toFilters(query: PolizasQueryDto): Promise<{
    aseguradoraId: number;
    desde?: Date;
    hasta?: Date;
  }> {
    const aseguradoraId = await this.aseguradoraResolver.resolveAseguradoraId(
      query.aseguradoraId,
    );
    if (!aseguradoraId) {
      const active = await this.insurerConnection.listActiveConnections();
      throw new BadRequestException(
        this.aseguradoraResolver.aseguradoraRequiredMessage(active.length),
      );
    }

    return {
      aseguradoraId,
      desde: query.desde ? new Date(query.desde) : undefined,
      hasta: query.hasta ? new Date(query.hasta) : undefined,
    };
  }

  async listAseguradoras(): Promise<
    Array<{
      id: unknown;
      codigo: unknown;
      nombre: unknown;
      tipoDb: unknown;
      host: unknown;
      databaseName: unknown;
      adapterCodigo: unknown;
    }>
  > {
    const rows = await this.insurerConnection.listActiveConnections();
    return rows.map((row) => ({
      id: row.id,
      codigo: row.codigo,
      nombre: row.nombre,
      tipoDb: row.tipo_db,
      host: row.host,
      databaseName: row.database_name,
      adapterCodigo: row.adapter_codigo,
    }));
  }

  async getReportePolizas(query: PolizasQueryDto): Promise<{
    data: Record<string, unknown>[];
    meta: Record<string, unknown>;
  }> {
    const filtros = await this.toFilters(query);

    const sync = await this.syncService.syncIncremental('polizas', filtros, {
      force:
        query.forceSync === true ||
        query.forceSync === 'true' ||
        query.forceSync === '1' ||
        query.forceSync === 1,
    });

    let sql = `
    SELECT id, origen_clave AS origen_id, numero_poliza,
           cedula_tomador AS documento_contratante, nombre_tomador AS nombre_contratante,
           ramo AS producto, estado, prima_total AS prima_anual,
           fecha_desde_poliza AS fecha_inicio, fecha_hasta_poliza AS fecha_fin,
           origen_modified_at, synced_at
    FROM poliza
    WHERE id_aseguradora = @aseguradoraId
  `;
    const params: Record<string, unknown> = {
      aseguradoraId: filtros.aseguradoraId,
    };

    if (query.desde) {
      sql += ' AND fecha_emision_poliza >= @desde';
      params.desde = query.desde;
    }
    if (query.hasta) {
      sql += ' AND fecha_emision_poliza <= @hasta';
      params.hasta = query.hasta;
    }
    if (query.estado) {
      sql += ' AND estado = @estado';
      params.estado = query.estado;
    }

    sql += ' ORDER BY fecha_emision_poliza DESC NULLS LAST, numero_poliza ASC';

    const result = await this.reportesPg.executeQuery(sql, params);
    const rows = assertQueryResult(result, 'getReportePolizas');

    return {
      data: rows.map((row) => ({
        id: row.id,
        origenId: row.origen_id,
        numeroPoliza: row.numero_poliza,
        documentoContratante: row.documento_contratante,
        nombreContratante: row.nombre_contratante,
        producto: row.producto,
        estado: row.estado,
        primaAnual: row.prima_anual != null ? String(row.prima_anual) : null,
        fechaInicio: row.fecha_inicio
          ? new Date(row.fecha_inicio as string | Date).toISOString().slice(0, 10)
          : null,
        fechaFin: row.fecha_fin
          ? new Date(row.fecha_fin as string | Date).toISOString().slice(0, 10)
          : null,
        origenModifiedAt: row.origen_modified_at
          ? new Date(row.origen_modified_at as string | Date).toISOString()
          : null,
        syncedAt: row.synced_at
          ? new Date(row.synced_at as string | Date).toISOString()
          : null,
      })),
      meta: {
        total: rows.length,
        aseguradoraId: filtros.aseguradoraId,
        sync,
        warning: sync.warning,
      },
    };
  }

  async getSyncStatus(aseguradoraId: number): Promise<Record<string, unknown>> {
    const config =
      await this.insurerConnection.getConnectionConfig(aseguradoraId);
    const connection =
      await this.insurerConnection.healthCheck(aseguradoraId);
    const watermarks =
      await this.watermarkRepo.listByAseguradora(aseguradoraId);

    return {
      aseguradora: {
        id: config.id,
        codigo: config.codigo,
        nombre: config.nombre,
        tipoDb: config.tipoDb,
        adapterCodigo: config.adapterCodigo,
      },
      connection,
      watermarks: watermarks.map((w) => ({
        entidad: w.entidad,
        lastModifiedAt: w.last_modified_at
          ? new Date(w.last_modified_at as string | Date).toISOString()
          : null,
        lastRunAt: w.last_run_at
          ? new Date(w.last_run_at as string | Date).toISOString()
          : null,
        rowsSynced: w.rows_synced,
        lastError: w.last_error,
      })),
    };
  }

  async getSyncStatusAll(): Promise<{
    total: number;
    health: Record<string, unknown>;
    statuses: Record<string, unknown>[];
  }> {
    const insurers = await this.listAseguradoras();
    const health = await this.syncOrchestrator.healthCheckAllActive();

    const statuses = await Promise.all(
      insurers.map(async (insurer) => {
        try {
          const status = await this.getSyncStatus(Number(insurer.id));
          return { ok: true, ...status };
        } catch (error) {
          return {
            ok: false,
            aseguradora: insurer,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return {
      total: insurers.length,
      health,
      statuses,
    };
  }

  async runSync(
    body: RunSyncDto = {} as RunSyncDto,
    headers: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const entidad = body.entidad;
    if (!entidad) {
      throw new BadRequestException(
        'entidad es requerida (recibos, siniestros, polizas, ramos, canales, productores, anulaciones, rechazos)',
      );
    }

    const filtros = await this.syncContext.buildSyncFilters(
      body as unknown as Record<string, unknown>,
      headers,
    );
    const force = Boolean(body?.forceSync || body?.sync?.force);
    const syncAll = body.syncAll === true || body?.sync?.all === true;

    if (syncAll) {
      const { aseguradoraId: _ignored, ...baseFiltros } = filtros;
      return this.syncOrchestrator.syncEntidadForAllActive(
        entidad,
        baseFiltros,
        { force },
      );
    }

    if (!filtros.aseguradoraId) {
      const active = await this.insurerConnection.listActiveConnections();
      throw new BadRequestException(
        this.aseguradoraResolver.aseguradoraRequiredMessage(active.length),
      );
    }

    const result = await this.syncService.syncIncremental(entidad, filtros, {
      force,
    });
    return {
      entidad,
      aseguradoraId: filtros.aseguradoraId,
      result,
    };
  }
}
