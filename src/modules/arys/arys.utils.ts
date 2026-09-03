export const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

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
  return (
    items.find((item) =>
      labelKeys.some((key) => normalizeText(item?.[key]) === normalizedLabel),
    ) ?? null
  );
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
