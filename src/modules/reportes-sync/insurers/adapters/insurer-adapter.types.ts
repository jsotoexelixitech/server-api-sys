import type { ExtractionPlan } from '../extraction/extraction.planner';

export type InsurerConnectionConfig = {
  id: number;
  codigo?: string;
  nombre?: string;
  tipoDb: string;
  host: string;
  port?: number | null;
  databaseName?: string | null;
  username?: string | null;
  password?: string | null;
  schemaOrigen?: string | null;
  adapterCodigo?: string | null;
  origenConfig?: Record<string, Record<string, unknown>>;
  modifiedAt?: Date | string | null;
};

export type InsurerAdapter = {
  ADAPTER_CODIGO: string;
  SUPPORTED_DB_TYPES: string[];
  SUPPORTED_ENTITIES: string[];
  supportsTipoDb: (tipoDb: string) => boolean;
  planEntityExtraction: (
    entidad: string,
    watermark: Date | null,
    filtros: Record<string, unknown>,
    schemaOrigen: string | null | undefined,
    tipoDb: string,
    connectionConfig: InsurerConnectionConfig,
  ) => ExtractionPlan;
  mapRow: (
    entidad: string,
    row: Record<string, unknown>,
    connectionConfig?: InsurerConnectionConfig,
  ) => Record<string, unknown>;
  mapCatalogRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  mapReciboRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  mapSiniestroRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  mapPolizaRow?: (row: Record<string, unknown>) => Record<string, unknown>;
};
