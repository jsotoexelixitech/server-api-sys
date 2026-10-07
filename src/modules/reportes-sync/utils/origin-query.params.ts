type FilterParamSpec = {
  type?: string;
  source?: string;
  sources?: string[];
  normalize?: string;
  map?: Record<string, unknown>;
  fallbackSingleChar?: boolean;
  whenSourceTruthy?: boolean;
  valueSource?: string;
  defaultWhenActive?: number | string;
};

type OriginConfigLike = {
  filterParams?: Record<string, FilterParamSpec | Record<string, unknown>> | null;
  defaultTipoFecha?: string | null;
  dateColByTipoFecha?: Record<string, string> | null;
  dateColByEstado?: Record<string, string> | null;
  dateCol?: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function intOrNull(value: unknown): number | null {
  const text = trimOrNull(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = trimOrNull(value);
  if (text === null) return null;
  const d = new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeMapKey(value: unknown, normalize: string): string | null {
  const text = trimOrNull(value);
  if (text === null) return null;
  switch (normalize) {
    case 'upper':
      return text.toUpperCase();
    case 'upper_accentless':
      return text
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    default:
      return text;
  }
}

function pickSourceValue(
  filtros: Record<string, unknown>,
  spec: FilterParamSpec,
  paramName: string,
): unknown {
  const keys =
    Array.isArray(spec.sources) && spec.sources.length > 0
      ? spec.sources
      : [spec.source || paramName];
  for (const key of keys) {
    const value = filtros[key];
    if (trimOrNull(value) !== null) return value;
  }
  return undefined;
}

function applyMapTransform(raw: unknown, spec: FilterParamSpec): unknown {
  const key = normalizeMapKey(raw, spec.normalize || 'upper');
  if (key === null) return null;
  if (spec.map && Object.prototype.hasOwnProperty.call(spec.map, key)) {
    return spec.map[key];
  }
  if (spec.fallbackSingleChar && key.length === 1) return key;
  return null;
}

function resolveParamValue(
  filtros: Record<string, unknown>,
  paramName: string,
  spec: FilterParamSpec,
): unknown {
  if (spec.whenSourceTruthy) {
    const sourceKeys =
      Array.isArray(spec.sources) && spec.sources.length > 0
        ? spec.sources
        : [spec.source || paramName];
    const hasSource = sourceKeys.some(
      (key) => trimOrNull(filtros[key]) !== null,
    );
    if (!hasSource) return null;

    const valueKey = spec.valueSource || paramName;
    const parsed = intOrNull(
      pickSourceValue(
        { [valueKey]: filtros[valueKey] },
        { source: valueKey },
        valueKey,
      ),
    );
    if (parsed !== null) return parsed;
    if (spec.defaultWhenActive !== undefined) {
      const fallback = Number(spec.defaultWhenActive);
      return Number.isFinite(fallback) ? fallback : null;
    }
    return null;
  }

  const raw = pickSourceValue(filtros, spec, paramName);

  switch (spec.type) {
    case 'date':
      return dateOrNull(raw);
    case 'int':
      return intOrNull(raw);
    case 'string':
      return trimOrNull(raw);
    case 'map':
      return applyMapTransform(raw, spec);
    default:
      return trimOrNull(raw);
  }
}

/**
 * Letra de estado del recibo (N/P/C/A) según filterParams.iestadorec, o null si no hay filtro.
 */
export function resolveEstadoLetter(
  filtros: Record<string, unknown>,
  originConfig: OriginConfigLike,
): string | null {
  const spec = originConfig.filterParams?.iestadorec;
  if (!spec || typeof spec !== 'object') return null;
  const value = resolveParamValue(filtros, 'iestadorec', spec as FilterParamSpec);
  const letter = trimOrNull(value);
  return letter === null ? null : letter.toUpperCase();
}

/**
 * Columna de fecha del origen con la que se extrae el rango. Prioridad:
 * tipoFecha explícito > estado (dateColByEstado) > defaultTipoFecha > dateCol.
 * Debe coincidir con la fecha que usa el SP del reporte para ese estado
 * (Cobrado → fecha de pago, Anulado → anulación, Pendiente → vigencia (fdesde)).
 */
export function resolveDateColumn(
  filtros: Record<string, unknown>,
  originConfig: OriginConfigLike,
): string {
  const explicitTipoFecha = trimOrNull(filtros.tipoFecha);
  const map = originConfig.dateColByTipoFecha || {};

  if (!explicitTipoFecha && originConfig.dateColByEstado) {
    const letter = resolveEstadoLetter(filtros, originConfig);
    const byEstado = letter ? originConfig.dateColByEstado[letter] : undefined;
    if (byEstado) return byEstado;
  }

  const tipoFecha =
    explicitTipoFecha ||
    trimOrNull(originConfig.defaultTipoFecha) ||
    'fecha_emision';
  return map[tipoFecha] || map.default || originConfig.dateCol || 'modified_at';
}

/**
 * true si el extract aplica algún filtro del origen distinto de rango de fechas y estado
 * (ramo, canal, productor, frecuencia, póliza, cliente, mora...).
 */
export function hasExtraOriginFilters(
  filtros: Record<string, unknown>,
  originConfig: OriginConfigLike,
): boolean {
  const params = buildQueryParams(filtros, originConfig);
  return Object.entries(params).some(
    ([name, value]) =>
      !['desde', 'hasta', 'iestadorec'].includes(name) &&
      value !== null &&
      value !== undefined,
  );
}

export function buildQueryParams(
  filtros: Record<string, unknown> = {},
  originConfig: OriginConfigLike = {},
): Record<string, unknown> {
  const specs = originConfig.filterParams;
  if (!specs || typeof specs !== 'object') return {};

  const params: Record<string, unknown> = {};
  for (const [paramName, spec] of Object.entries(specs)) {
    if (!spec || typeof spec !== 'object') continue;
    params[paramName] = resolveParamValue(
      filtros,
      paramName,
      spec as FilterParamSpec,
    );
  }
  return params;
}

export { trimOrNull };
