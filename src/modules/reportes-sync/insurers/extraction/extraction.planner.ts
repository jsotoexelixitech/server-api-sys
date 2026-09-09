import { EXTRACT_MODES, isDatabaseMode } from './extraction-mode.types';
import {
  resolveOriginConfig,
  type ResolvedOriginConfig,
} from './origin-config.resolver';
import { buildDatabaseExtraction } from './database-query.builder';

export type ExtractionPlan =
  | {
      source: 'database';
      query: string;
      params: Record<string, unknown>;
      originConfig: ResolvedOriginConfig;
    }
  | {
      source: 'api';
      originConfig: ResolvedOriginConfig;
      query?: undefined;
      params?: undefined;
    };

export function planExtraction(
  entidad: string,
  watermark: Date | null,
  filtros: Record<string, unknown>,
  schemaOrigen: string | null | undefined,
  tipoDb: string,
  connectionConfig: {
    origenConfig?: Record<string, Record<string, unknown>>;
  },
  defaultTimeoutMs = 60000,
): ExtractionPlan {
  const originConfig = resolveOriginConfig(
    entidad,
    connectionConfig,
    defaultTimeoutMs,
  );

  if (originConfig.mode === EXTRACT_MODES.API) {
    return { source: 'api', originConfig };
  }

  if (!isDatabaseMode(originConfig.mode)) {
    throw new Error(`Modo de extracción no soportado: ${originConfig.mode}`);
  }

  if (originConfig.mode === EXTRACT_MODES.QUERY && !originConfig.querySql) {
    throw new Error(
      `origen_config.${entidad}.querySql requerido en aseguradora_conexion para mode=query`,
    );
  }

  const dbPlan = buildDatabaseExtraction(
    entidad,
    originConfig,
    watermark,
    filtros,
    schemaOrigen,
    tipoDb,
  );

  return { ...dbPlan, originConfig };
}

export { resolveOriginConfig };
