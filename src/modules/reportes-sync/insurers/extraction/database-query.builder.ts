import { EXTRACT_MODES } from './extraction-mode.types';
import { getDialect, defaultSchemaFor } from '../dialects';
import { normalizeInsurerDbType } from '../../origin-db/origin-db-engine.types';
import { buildSyncWhereClause } from '../../utils/sync-query.utils';
import {
  buildQueryParams,
  resolveDateColumn,
} from '../../utils/origin-query.params';
import type { ResolvedOriginConfig } from './origin-config.resolver';
import type { SqlDialect } from '../dialects';

const DEFAULT_VIEWS: Record<string, string> = {
  recibos: 'vw_reporte_recibos',
  siniestros: 'vw_reporte_siniestros',
  polizas: 'vw_reporte_polizas',
};

function buildViewQuery(
  entidad: string,
  originConfig: ResolvedOriginConfig,
  watermark: Date | null,
  filtros: Record<string, unknown>,
  schema: string,
  dialect: SqlDialect,
): { query: string; params: Record<string, unknown> } {
  const viewName = originConfig.view || DEFAULT_VIEWS[entidad];
  if (!viewName) {
    throw new Error(`Vista no configurada para entidad ${entidad}`);
  }

  const view = dialect.quoteTable(schema, viewName);
  const wmCol =
    originConfig.watermarkExpr || originConfig.watermarkCol || 'modified_at';
  const dateCol =
    originConfig.dateCol ||
    (entidad === 'recibos'
      ? 'fecha_emision'
      : entidad === 'siniestros'
        ? 'fecha_notificacion'
        : 'fecha_emision_poliza');

  const { whereSql, params, orderBy } = buildSyncWhereClause({
    refreshScope: Boolean(filtros.refreshScope),
    wmExpr: wmCol,
    dateCol,
    watermark,
    filtros: filtros as {
      desde?: Date;
      hasta?: Date;
      refreshScope?: boolean;
      fullResync?: boolean;
    },
    param: dialect.param.bind(dialect),
  });

  const query = `SELECT * FROM ${view} WHERE ${whereSql} ORDER BY ${orderBy} ASC`;
  return { query, params };
}

function applySchemaPlaceholders(sql: string, schema: string): string {
  if (!sql.includes('{schema}')) return sql;
  return sql.replace(/\{schema\}/g, schema || 'dbo');
}

function applyDateColumnPlaceholder(
  sql: string,
  filtros: Record<string, unknown>,
  originConfig: ResolvedOriginConfig,
): string {
  if (!sql.includes('/*SYNC_DATE_COL*/')) return sql;
  const dateCol = resolveDateColumn(filtros, originConfig);
  return sql.replace(/\/\*SYNC_DATE_COL\*\//g, dateCol);
}

function usesOriginFilterParams(
  sql: string,
  originConfig: ResolvedOriginConfig,
): boolean {
  const specs = originConfig.filterParams;
  if (specs && typeof specs === 'object') {
    return Object.keys(specs).some((name) => sql.includes(`@${name}`));
  }
  return /@\w+/.test(sql);
}

function buildCustomSqlQuery(
  entidad: string,
  originConfig: ResolvedOriginConfig,
  watermark: Date | null,
  filtros: Record<string, unknown>,
  dialect: SqlDialect,
  schema: string,
): { query: string; params: Record<string, unknown> } {
  const wmCol =
    originConfig.watermarkExpr || originConfig.watermarkCol || 'modified_at';
  const dateCol =
    originConfig.dateCol ||
    (entidad === 'recibos'
      ? 'fecha_emision'
      : entidad === 'siniestros'
        ? 'fecha_notificacion'
        : 'fecha_emision_poliza');

  let sql = String(originConfig.querySql || '').trim();
  if (!sql) {
    throw new Error(
      `origen_config.${entidad}.querySql requerido en aseguradora_conexion (no hay queries en código)`,
    );
  }

  sql = applySchemaPlaceholders(sql, schema);
  sql = applyDateColumnPlaceholder(sql, filtros, originConfig);

  const hasOriginFilters = usesOriginFilterParams(sql, originConfig);
  const originParams = hasOriginFilters
    ? buildQueryParams(filtros, originConfig)
    : {};

  const { whereSql, params, orderBy } = buildSyncWhereClause({
    refreshScope: Boolean(filtros.refreshScope),
    wmExpr: wmCol,
    dateCol,
    watermark,
    filtros: filtros as {
      desde?: Date;
      hasta?: Date;
      refreshScope?: boolean;
      fullResync?: boolean;
    },
    param: dialect.param.bind(dialect),
    skipDateFilter: hasOriginFilters,
  });

  const mergedParams = { ...originParams, ...params };

  let syncAppend = '';
  if (!(hasOriginFilters && filtros.refreshScope) && whereSql) {
    const beforeSync = sql.split('/*SYNC_WHERE*/')[0] || sql;
    syncAppend = /\bWHERE\b/i.test(beforeSync)
      ? ` AND (${whereSql})`
      : ` WHERE ${whereSql}`;
  }

  if (sql.includes('/*SYNC_WHERE*/')) {
    sql = sql.replace('/*SYNC_WHERE*/', syncAppend);
  } else if (/\bWHERE\b/i.test(sql)) {
    sql = `${sql}${syncAppend}`;
  } else if (syncAppend) {
    sql = `${sql}${syncAppend}`;
  } else if (!/\bWHERE\b/i.test(sql)) {
    sql = `${sql} WHERE 1=1`;
  }

  const orderClause = orderBy ? `ORDER BY ${orderBy} ASC` : '';
  if (sql.includes('/*SYNC_ORDER BY*/')) {
    sql = sql.replace('/*SYNC_ORDER BY*/', orderClause);
  } else if (!/\bORDER BY\b/i.test(sql) && orderBy) {
    sql = `${sql} ${orderClause}`;
  }

  return { query: sql.trim(), params: mergedParams };
}

export function buildDatabaseExtraction(
  entidad: string,
  originConfig: ResolvedOriginConfig,
  watermark: Date | null,
  filtros: Record<string, unknown>,
  schemaOrigen: string | null | undefined,
  tipoDb: string,
): {
  source: 'database';
  query: string;
  params: Record<string, unknown>;
} {
  const engine = normalizeInsurerDbType(tipoDb);
  const dialect = getDialect(engine);
  const schema = defaultSchemaFor(engine, schemaOrigen);

  const hasQuerySql = Boolean(originConfig.querySql);

  if (originConfig.mode === EXTRACT_MODES.QUERY && !hasQuerySql) {
    throw new Error(
      `origen_config.${entidad}.querySql requerido en aseguradora_conexion ` +
        `(mode=query; los SQL no viven en el backend)`,
    );
  }

  const built = hasQuerySql
    ? buildCustomSqlQuery(
        entidad,
        originConfig,
        watermark,
        filtros,
        dialect,
        schema,
      )
    : buildViewQuery(
        entidad,
        originConfig,
        watermark,
        filtros,
        schema,
        dialect,
      );

  return {
    source: 'database',
    query: built.query,
    params: built.params,
  };
}
