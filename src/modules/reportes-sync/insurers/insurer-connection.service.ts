import { Injectable, Logger } from '@nestjs/common';
import { ReportesPgService } from '../../../database/reportes-pg.service';
import { assertQueryResult, firstRow } from '../utils/sync.helpers';
import { InsurerPoolManager } from './insurer-pool.manager';
import { InsurerApiClient } from './extraction/insurer-api.client';
import type { InsurerConnectionConfig } from './adapters/insurer-adapter.types';
import type { ResolvedOriginConfig } from './extraction/origin-config.resolver';

function parseOrigenConfig(value: unknown): Record<string, Record<string, unknown>> {
  if (!value) return {};
  if (typeof value === 'object') {
    return value as Record<string, Record<string, unknown>>;
  }
  try {
    return JSON.parse(String(value)) as Record<string, Record<string, unknown>>;
  } catch {
    return {};
  }
}

@Injectable()
export class InsurerConnectionService {
  private readonly logger = new Logger(InsurerConnectionService.name);

  constructor(
    private readonly reportesPg: ReportesPgService,
    private readonly insurerPool: InsurerPoolManager,
    private readonly apiClient: InsurerApiClient,
  ) {}

  async getConnectionConfig(
    aseguradoraId: number,
  ): Promise<InsurerConnectionConfig> {
    const result = await this.reportesPg.executeQuery(
      `SELECT id, codigo, nombre, tipo_db, host, port, database_name, username, password,
            schema_origen, adapter_codigo, origen_config, modificado
     FROM aseguradora_conexion
     WHERE id = @aseguradoraId AND activo = TRUE
     LIMIT 1`,
      { aseguradoraId },
    );

    const row = firstRow(result, 'getConnectionConfig');
    if (!row) {
      throw new Error(`Aseguradora ${aseguradoraId} no encontrada o inactiva`);
    }

    return {
      id: Number(row.id),
      codigo: row.codigo as string | undefined,
      nombre: row.nombre as string | undefined,
      tipoDb: String(row.tipo_db),
      host: String(row.host),
      port: row.port != null ? Number(row.port) : null,
      databaseName: (row.database_name as string) || null,
      username: (row.username as string) || null,
      password: (row.password as string) || null,
      schemaOrigen: (row.schema_origen as string) || null,
      adapterCodigo: (row.adapter_codigo as string) || null,
      origenConfig: parseOrigenConfig(row.origen_config),
      modifiedAt: (row.modificado as Date | string) || null,
    };
  }

  async listActiveConnections(): Promise<Record<string, unknown>[]> {
    const result = await this.reportesPg.executeQuery(
      `SELECT id, codigo, nombre, tipo_db, host, port, database_name, adapter_codigo, activo
     FROM aseguradora_conexion
     WHERE activo = TRUE
     ORDER BY codigo ASC`,
      {},
    );
    return assertQueryResult(result, 'listActiveConnections');
  }

  async listActiveConnectionsSafe(): Promise<Record<string, unknown>[]> {
    try {
      return await this.listActiveConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`listActiveConnections failed: ${message}`);
      return [];
    }
  }

  async querySource(
    aseguradoraId: number,
    query: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const config = await this.getConnectionConfig(aseguradoraId);
    return this.insurerPool.query(config, query, params);
  }

  async fetchFromApi(
    originConfig: ResolvedOriginConfig,
    watermark: Date | null,
    filtros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.apiClient.fetchIncrementalRows(originConfig, watermark, filtros);
  }

  async healthCheck(aseguradoraId: number): Promise<Record<string, unknown>> {
    const config = await this.getConnectionConfig(aseguradoraId);
    return this.insurerPool.healthCheck(config);
  }

  async healthCheckApi(
    originConfig: ResolvedOriginConfig,
  ): Promise<Record<string, unknown>> {
    return this.apiClient.healthCheck(originConfig);
  }
}
