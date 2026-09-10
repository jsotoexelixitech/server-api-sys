export function pick(
  row: Record<string, unknown> | null | undefined,
  ...keys: string[]
): unknown {
  if (!row || typeof row !== 'object') return undefined;
  const lookup = new Map(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
  );
  for (const key of keys) {
    if (key in row) return row[key];
    const found = lookup.get(String(key).toLowerCase());
    if (found !== undefined) return found;
  }
  return undefined;
}

export function toStr(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

export function toNum(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Fecha calendario (sin hora) para columnas DATE en PostgreSQL.
 * SQL Server devuelve DATE como medianoche UTC; pasar un Date a pg en UTC-4
 * resta un día. Usamos componentes UTC → 'YYYY-MM-DD'.
 */
export function toDateOnly(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1];
  }

  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildOrigenClave(parts: unknown[]): string {
  return parts.map((p) => (p == null ? '' : String(p))).join('|');
}
