export const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

/** Sis2000 `maestados.xdescripcion_c` → nombre que usa el catálogo Arys. */
const ESTADO_ARYS_ALIASES: Record<string, string> = {
  'DTTO CAPITAL': 'DISTRITO CAPITAL',
  'DTO CAPITAL': 'DISTRITO CAPITAL',
  'DIST CAPITAL': 'DISTRITO CAPITAL',
  'DIST. CAPITAL': 'DISTRITO CAPITAL',
};

export const resolveEstadoArysName = (estadoName: unknown): string => {
  const normalized = normalizeText(estadoName);
  return ESTADO_ARYS_ALIASES[normalized] ?? normalized;
};

export const onlyDigits = (value: unknown): string | null => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
};

export const pickValue = (source: Record<string, unknown> | null | undefined, keys: string[]): unknown => {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
};

export const findByLabel = (
  items: Record<string, unknown>[],
  label: unknown,
  labelKeys: string[],
): Record<string, unknown> | null => {
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel) return null;
  return (
    items.find((item) =>
      labelKeys.some((key) => normalizeText(item?.[key]) === normalizedLabel),
    ) ?? null
  );
};

const itemLabels = (item: Record<string, unknown>, labelKeys: string[]): string[] =>
  labelKeys.map((key) => normalizeText(item?.[key])).filter(Boolean);

/**
 * Exact match first, then prefix/contains. Used for marca/modelo/versión/color
 * when Sis2000 and Arys do not share the same label (`R3` vs `R3 - Sincronico`).
 */
export const findBestByLabel = (
  items: Record<string, unknown>[],
  label: unknown,
  labelKeys: string[],
): Record<string, unknown> | null => {
  const exact = findByLabel(items, label, labelKeys);
  if (exact) return exact;

  const normalizedLabel = normalizeText(label);
  if (normalizedLabel.length < 2) return null;

  let best: { item: Record<string, unknown>; score: number } | null = null;
  for (const item of items) {
    for (const value of itemLabels(item, labelKeys)) {
      if (value.length < 2) continue;
      let score = 0;
      if (value.startsWith(normalizedLabel) || normalizedLabel.startsWith(value)) {
        score = 2 + Math.min(value.length, normalizedLabel.length);
      } else if (value.includes(normalizedLabel) || normalizedLabel.includes(value)) {
        score = 1 + Math.min(value.length, normalizedLabel.length);
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { item, score };
      }
    }
  }
  return best?.item ?? null;
};

export const firstCatalogItem = (
  items: Record<string, unknown>[] | null | undefined,
): Record<string, unknown> | null => {
  if (!items?.length) return null;
  return items.find((item) => item.eliminado !== true) ?? items[0];
};

export const extractNumericResult = (payload: { result?: unknown }): number | null => {
  const result = payload?.result;
  if (typeof result === 'number' && Number.isFinite(result) && result > 0) {
    return result;
  }
  if (typeof result === 'string' && result.trim() !== '' && result !== '0') {
    const n = Number(result);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    const id = pickValue(obj, ['id_propietario', 'id_vehiculo', 'id_veh', 'id']);
    if (id != null) {
      const n = Number(id);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
};

export const isZeroArysResult = (payload: { result?: unknown } | null | undefined): boolean => {
  const result = payload?.result;
  return result === 0 || result === '0';
};
