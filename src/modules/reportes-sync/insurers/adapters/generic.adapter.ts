import { planExtraction, type ExtractionPlan } from '../extraction/extraction.planner';
import { mapRowFromConfig } from '../mapping/column-mapper';
import { CATALOG_ENTIDADES } from '../../utils/sync-catalog.constants';
import { normalizeInsurerDbType } from '../../origin-db/origin-db-engine.types';
import type { InsurerAdapter } from './insurer-adapter.types';

export const genericAdapter: InsurerAdapter = {
  ADAPTER_CODIGO: 'GENERIC',
  SUPPORTED_DB_TYPES: ['mssql', 'postgresql', 'oracle', 'mysql'],
  SUPPORTED_ENTITIES: ['recibos', 'siniestros', 'polizas', ...CATALOG_ENTIDADES],

  supportsTipoDb(tipoDb: string): boolean {
    return this.SUPPORTED_DB_TYPES.includes(normalizeInsurerDbType(tipoDb));
  },

  planEntityExtraction(
    entidad,
    watermark,
    filtros,
    schemaOrigen,
    tipoDb,
    connectionConfig,
  ): ExtractionPlan {
    if (!this.SUPPORTED_ENTITIES.includes(entidad)) {
      throw new Error(`Entidad no soportada: ${entidad}`);
    }
    return planExtraction(
      entidad,
      watermark,
      filtros,
      schemaOrigen,
      tipoDb,
      connectionConfig,
    );
  },

  mapRow(entidad, row, connectionConfig) {
    const entityConfig =
      (connectionConfig?.origenConfig?.[entidad] as Record<string, unknown>) ||
      {};
    return mapRowFromConfig(entidad, row, entityConfig);
  },
};
