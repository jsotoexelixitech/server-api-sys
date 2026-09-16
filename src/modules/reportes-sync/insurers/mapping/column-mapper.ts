import {
  pick,
  toStr,
  toNum,
  toDate,
  toDateOnly,
  buildOrigenClave,
} from '../../utils/sync-row.utils';

const DATE_FIELDS = new Set([
  'fechaEmision',
  'fechaAnulacion',
  'fechaDesde',
  'fechaHasta',
  'fechaPago',
  'fechaOcurrencia',
  'fechaNotificacion',
  'fechaEmisionOrden',
  'fechaPagoOrden',
  'fechaAnulacion',
  'fechaRechazo',
  'fechaInicio',
  'fechaFin',
  'fechaEmisionPoliza',
  'fechaDesdePoliza',
  'fechaHastaPoliza',
]);

export const DEFAULT_ORIGEN_CLAVE: Record<
  string,
  string | { concat: string[]; sep: string }
> = {
  recibos: {
    concat: ['recibo', 'poliza', 'fecha_desde', 'tipo_recibo'],
    sep: '|',
  },
  siniestros: 'numero_siniestro',
  polizas: {
    concat: ['numero_poliza', 'id_ramo', 'fecha_emision_poliza'],
    sep: '|',
  },
  ramos: 'id',
  canales: 'id',
  productores: 'id',
  anulaciones: 'id',
  rechazos: 'id',
};

export function snakeToCamel(key: string): string {
  return String(key).replace(/_([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

function resolveFieldSpec(
  spec: unknown,
  row: Record<string, unknown>,
): unknown {
  if (spec === undefined || spec === null) return undefined;
  if (typeof spec === 'string') return pick(row, spec, snakeToCamel(spec));
  if (typeof spec === 'object' && Array.isArray((spec as { concat?: string[] }).concat)) {
    const parts = (spec as { concat: string[] }).concat.map((field) =>
      pick(row, field, snakeToCamel(field)),
    );
    return buildOrigenClave(parts);
  }
  if (typeof spec === 'object' && (spec as { field?: string }).field) {
    const field = (spec as { field: string }).field;
    return pick(row, field, snakeToCamel(field));
  }
  return undefined;
}

function coerceValue(
  targetKey: string,
  value: unknown,
  spec: unknown,
): unknown {
  const type =
    spec && typeof spec === 'object'
      ? (spec as { type?: string }).type
      : undefined;
  if (type === 'date' || DATE_FIELDS.has(targetKey)) {
    return toDateOnly(value);
  }
  if (type === 'datetime') {
    return toDate(value);
  }
  if (type === 'number' || type === 'decimal') {
    return toNum(value);
  }
  if (type === 'string') {
    return toStr(value);
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && DATE_FIELDS.has(targetKey)) {
    return toDateOnly(value);
  }
  return value;
}

/**
 * Mapea fila origen → objeto upsert usando columnMap en origen_config.
 */
export function mapRowFromConfig(
  entidad: string,
  row: Record<string, unknown>,
  entityConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  const columnMap =
    (entityConfig.columnMap as Record<string, unknown>) ||
    (entityConfig.mapeo_columnas as Record<string, unknown>) ||
    {};
  const mapped: Record<string, unknown> = {};

  if (
    columnMap &&
    typeof columnMap === 'object' &&
    Object.keys(columnMap).length > 0
  ) {
    for (const [targetKey, spec] of Object.entries(columnMap)) {
      if (targetKey === 'origenClave' || targetKey === 'origen_clave') continue;
      const raw = resolveFieldSpec(spec, row);
      mapped[targetKey] = coerceValue(targetKey, raw, spec);
    }
  } else {
    for (const [key, value] of Object.entries(row || {})) {
      if (key === 'modified_at' || key === 'synced_at') continue;
      const camel = snakeToCamel(key);
      mapped[camel] = coerceValue(camel, value, null);
    }
  }

  const claveSpec =
    columnMap.origenClave ??
    columnMap.origen_clave ??
    entityConfig.origenClave ??
    DEFAULT_ORIGEN_CLAVE[entidad];

  if (typeof claveSpec === 'string') {
    mapped.origenClave = toStr(resolveFieldSpec(claveSpec, row));
  } else if (
    claveSpec &&
    typeof claveSpec === 'object' &&
    Array.isArray((claveSpec as { concat?: string[] }).concat)
  ) {
    mapped.origenClave = resolveFieldSpec(claveSpec, row);
  }

  if (!mapped.origenClave) {
    const fallback = DEFAULT_ORIGEN_CLAVE[entidad];
    if (typeof fallback === 'string') {
      mapped.origenClave = toStr(resolveFieldSpec(fallback, row));
    } else if (fallback?.concat) {
      mapped.origenClave = resolveFieldSpec(fallback, row);
    }
  }

  if (entidad === 'polizas' && !mapped.origenId) {
    mapped.origenId =
      mapped.origenClave || toStr(pick(row, 'origen_id', 'id', 'ID'));
  }

  const wmField =
    (entityConfig.watermarkCol as string) ||
    (entityConfig.watermark_col as string) ||
    'modified_at';
  mapped.origenModifiedAt =
    toDate(
      pick(row, wmField, 'modified_at', 'origen_modified_at', snakeToCamel(wmField)),
    ) ||
    mapped.origenModifiedAt ||
    null;

  if (entidad === 'polizas' && !mapped.origenModifiedAt) {
    mapped.origenModifiedAt =
      toDate(pick(row, 'modified_at', 'MODIFIED_AT')) || new Date();
  }

  return mapped;
}
