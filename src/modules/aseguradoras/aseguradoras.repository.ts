import { Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../database/reportes-pg.service';
import { CATALOG_ENTIDADES } from '../reportes-sync/utils/sync-catalog.constants';
import {
  assertQueryResult,
  firstRow,
} from '../reportes-sync/utils/sync.helpers';

export const ENTIDADES_SYNC = [
  'recibos',
  'siniestros',
  'polizas',
  ...CATALOG_ENTIDADES,
] as const;

export type AseguradoraPayload = {
  codigo: string;
  nombre: string;
  tipoDb: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password?: string;
  schemaOrigen?: string | null;
  adapterCodigo: string;
  origenConfig: Record<string, unknown>;
  activo: boolean;
};

@Injectable()
export class AseguradorasRepository {
  constructor(private readonly reportesPg: ReportesPgService) {}

  parseOrigenConfig(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object') return value as Record<string, unknown>;
    try {
      return JSON.parse(String(value)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  maskRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!row) return row;
    const { password, ...safe } = row;
    return {
      ...safe,
      origen_config: this.parseOrigenConfig(row.origen_config),
      tiene_password: Boolean(password),
    };
  }

  async listAll(includeInactive = false): Promise<Record<string, unknown>[]> {
    const sql = includeInactive
      ? `SELECT id, codigo, nombre, tipo_db, host, port, database_name, username, password,
              schema_origen, adapter_codigo, origen_config, activo, creado, modificado
       FROM aseguradora_conexion
       ORDER BY codigo ASC`
      : `SELECT id, codigo, nombre, tipo_db, host, port, database_name, username, password,
              schema_origen, adapter_codigo, origen_config, activo, creado, modificado
       FROM aseguradora_conexion
       WHERE activo = TRUE
       ORDER BY codigo ASC`;

    const result = await this.reportesPg.executeQuery(sql, {});
    return assertQueryResult(result, 'listAll').map((row) =>
      this.maskRow(row),
    ) as Record<string, unknown>[];
  }

  async getById(id: number): Promise<Record<string, unknown> | null> {
    const result = await this.reportesPg.executeQuery(
      `SELECT id, codigo, nombre, tipo_db, host, port, database_name, username, password,
            schema_origen, adapter_codigo, origen_config, activo, creado, modificado
     FROM aseguradora_conexion
     WHERE id = @id
     LIMIT 1`,
      { id },
    );
    const row = firstRow(result, 'getById');
    return row ? this.maskRow(row) : null;
  }

  async getByCodigo(
    codigo: string,
  ): Promise<Record<string, unknown> | null> {
    const result = await this.reportesPg.executeQuery(
      `SELECT id FROM aseguradora_conexion WHERE codigo = @codigo LIMIT 1`,
      { codigo },
    );
    return firstRow(result, 'getByCodigo');
  }

  async create(
    data: AseguradoraPayload,
  ): Promise<Record<string, unknown>> {
    const result = await this.reportesPg.executeQuery(
      `INSERT INTO aseguradora_conexion (
       codigo, nombre, tipo_db, host, port, database_name, username, password,
       schema_origen, adapter_codigo, origen_config, activo, modificado
     ) VALUES (
       @codigo, @nombre, @tipoDb::tipo_db_aseguradora, @host, @port, @databaseName,
       @username, @password, @schemaOrigen, @adapterCodigo, @origenConfig::jsonb, @activo, NOW()
     )
     RETURNING id, codigo, nombre, tipo_db, host, port, database_name, username,
               schema_origen, adapter_codigo, origen_config, activo, creado, modificado`,
      {
        codigo: data.codigo,
        nombre: data.nombre,
        tipoDb: data.tipoDb,
        host: data.host,
        port: data.port || 1433,
        databaseName: data.databaseName,
        username: data.username,
        password: data.password,
        schemaOrigen: data.schemaOrigen || null,
        adapterCodigo: data.adapterCodigo || 'GENERIC',
        origenConfig: JSON.stringify(data.origenConfig || {}),
        activo: data.activo !== false,
      },
    );

    const row = firstRow(result, 'create');
    if (!row) throw new Error('No se pudo crear la aseguradora');

    for (const entidad of ENTIDADES_SYNC) {
      await this.reportesPg.executeQuery(
        `INSERT INTO sync_watermark (id_aseguradora, entidad, rows_synced)
       VALUES (@id, @entidad::sync_entidad, 0)
       ON CONFLICT (id_aseguradora, entidad) DO NOTHING`,
        { id: row.id, entidad },
      );
    }

    return this.maskRow(row) as Record<string, unknown>;
  }

  async update(
    id: number,
    data: Partial<AseguradoraPayload>,
  ): Promise<Record<string, unknown> | null> {
    const current = await this.getById(id);
    if (!current) return null;

    const result = await this.reportesPg.executeQuery(
      `UPDATE aseguradora_conexion SET
       codigo = @codigo,
       nombre = @nombre,
       tipo_db = @tipoDb::tipo_db_aseguradora,
       host = @host,
       port = @port,
       database_name = @databaseName,
       username = @username,
       password = COALESCE(@password, password),
       schema_origen = @schemaOrigen,
       adapter_codigo = @adapterCodigo,
       origen_config = @origenConfig::jsonb,
       activo = @activo,
       modificado = NOW()
     WHERE id = @id
     RETURNING id, codigo, nombre, tipo_db, host, port, database_name, username,
               schema_origen, adapter_codigo, origen_config, activo, creado, modificado`,
      {
        id,
        codigo: data.codigo ?? current.codigo,
        nombre: data.nombre ?? current.nombre,
        tipoDb: data.tipoDb ?? current.tipo_db,
        host: data.host ?? current.host,
        port: data.port ?? current.port,
        databaseName: data.databaseName ?? current.database_name,
        username: data.username ?? current.username,
        password: data.password || null,
        schemaOrigen:
          data.schemaOrigen !== undefined
            ? data.schemaOrigen
            : current.schema_origen,
        adapterCodigo: data.adapterCodigo ?? current.adapter_codigo,
        origenConfig: JSON.stringify(
          data.origenConfig !== undefined
            ? data.origenConfig
            : current.origen_config,
        ),
        activo:
          data.activo !== undefined ? data.activo : current.activo,
      },
    );

    const row = firstRow(result, 'update');
    return row ? this.maskRow(row) : null;
  }

  async remove(id: number): Promise<Record<string, unknown> | null> {
    const result = await this.reportesPg.executeQuery(
      `UPDATE aseguradora_conexion SET activo = FALSE, modificado = NOW() WHERE id = @id RETURNING id`,
      { id },
    );
    return firstRow(result, 'remove');
  }
}
