const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Siempre horario Venezuela. */
export function formatDateVe(d: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Caracas',
  }).format(d);
}

export function formatDayVe(d: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    timeZone: 'America/Caracas',
  }).format(d);
}

export function formatMonthNameVe(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    month: '2-digit',
    timeZone: 'America/Caracas',
  }).formatToParts(d);
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  return MESES_ES[Number(month) - 1] ?? '';
}

export function formatYearVe(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    timeZone: 'America/Caracas',
  }).format(d);
}

export function formatMoneyVe(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0,00';
  }
  const fixed = Number(value).toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${dec}`;
}

export function mapMonedaLabel(moneda: string): string {
  const upper = (moneda ?? '').toUpperCase();
  if (upper === 'USD' || upper === 'US$') return 'DOLARES';
  if (upper === 'VES' || upper === 'BS' || upper === 'BSS') return 'BOLIVARES';
  return moneda || '—';
}

export function mapMonedaSymbol(moneda: string): string {
  const upper = (moneda ?? '').toUpperCase();
  if (upper === 'USD' || upper === 'US$') return '$';
  return 'Bs';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dash(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '—';
}

export function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

export function pickRiskValue(
  riskData: Record<string, unknown> | undefined,
  ...candidates: string[]
): string {
  if (!riskData) return '';
  const normalizedMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(riskData)) {
    normalizedMap.set(normalizeKey(k), v);
  }
  for (const candidate of candidates) {
    const v = normalizedMap.get(normalizeKey(candidate));
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  // Etiquetas largas del product-builder (ej. "Serial de carrocería" → serialdecarroceria)
  for (const candidate of candidates) {
    const needle = normalizeKey(candidate);
    if (needle.length < 4) continue;
    for (const [k, v] of normalizedMap) {
      if (k.includes(needle) && v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
  }
  return '';
}
