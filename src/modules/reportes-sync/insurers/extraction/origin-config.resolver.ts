import { EXTRACT_MODES, type ExtractMode } from './extraction-mode.types';

export type ResolvedOriginConfig = {
  mode: ExtractMode;
  view: string | null;
  querySql: string | null;
  dateCol: string | null;
  columnMap: Record<string, unknown> | null;
  origenClave: unknown;
  watermarkCol: string;
  watermarkExpr: string | null;
  dateColByTipoFecha: Record<string, string> | null;
  defaultTipoFecha: string | null;
  filterParams: Record<string, Record<string, unknown>> | null;
  apiUrl: string | null;
  apiMethod: string;
  apiToken: string | null;
  apiRowsPath: string;
  apiTimeoutMs: number;
};

function normalizeMode(value: unknown): ExtractMode | null {
  const mode = String(value || '').toLowerCase();
  if ((Object.values(EXTRACT_MODES) as string[]).includes(mode)) {
    return mode as ExtractMode;
  }
  return null;
}

function inferMode(partial: {
  apiUrl: string | null;
  querySql: string | null;
  view: string | null;
}): ExtractMode {
  if (partial.apiUrl) return EXTRACT_MODES.API;
  if (partial.querySql) return EXTRACT_MODES.QUERY;
  if (partial.view) return EXTRACT_MODES.VIEW;
  return EXTRACT_MODES.VIEW;
}

function pickDb<T>(value: T | null | undefined, fallback: T | null = null): T | null {
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

export function resolveOriginConfig(
  entidad: string,
  connectionConfig: {
    origenConfig?: Record<string, Record<string, unknown>>;
  } = {},
  defaultTimeoutMs = 60000,
): ResolvedOriginConfig {
  const fromDb = connectionConfig.origenConfig?.[entidad] || {};

  const view = pickDb(fromDb.view as string | null);
  const querySql = pickDb(
    (fromDb.querySql || fromDb.sql) as string | null,
  );
  const apiUrl = pickDb(fromDb.apiUrl as string | null);

  const partial = { view, querySql, apiUrl };

  const mode =
    normalizeMode(fromDb.mode) ||
    (querySql ? EXTRACT_MODES.QUERY : inferMode(partial));

  return {
    mode,
    view,
    querySql,
    dateCol: pickDb(fromDb.dateCol as string | null),
    columnMap:
      (fromDb.columnMap as Record<string, unknown>) ||
      (fromDb.mapeo_columnas as Record<string, unknown>) ||
      null,
    origenClave: fromDb.origenClave || fromDb.origen_clave || null,
    watermarkCol: pickDb(fromDb.watermarkCol as string | null, 'modified_at') ||
      'modified_at',
    watermarkExpr: pickDb(fromDb.watermarkExpr as string | null),
    dateColByTipoFecha:
      (fromDb.dateColByTipoFecha as Record<string, string>) || null,
    defaultTipoFecha: pickDb(fromDb.defaultTipoFecha as string | null),
    filterParams:
      (fromDb.filterParams as Record<string, Record<string, unknown>>) || null,
    apiUrl,
    apiMethod: String(pickDb(fromDb.apiMethod as string | null, 'GET')).toUpperCase(),
    apiToken: pickDb(fromDb.apiToken as string | null),
    apiRowsPath: pickDb(fromDb.apiRowsPath as string | null, '') || '',
    apiTimeoutMs: Number(fromDb.apiTimeoutMs || defaultTimeoutMs),
  };
}
