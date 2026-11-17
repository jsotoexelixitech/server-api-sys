/** Códigos de Sis2000 que representan dólares (`maplanes.cmoneda`). */
const USD_ALIAS = new Set(['$', 'US$', 'USD', 'DOL', 'D', '']);
const EUR_ALIAS = new Set(['EUR', '€']);

/**
 * Normaliza la moneda de Sis2000 a ISO 4217 para el integrador (Payall/Farmatodo).
 * `$`, `US$`, `USD`, `DOL`, `D`, vacío o null → `USD`; `EUR`/`€` → `EUR`;
 * cualquier otro código se devuelve tal cual en mayúsculas.
 */
export function monedaIso(cmoneda: string | null | undefined): string {
  const code = String(cmoneda ?? '').trim().toUpperCase();
  if (USD_ALIAS.has(code)) return 'USD';
  if (EUR_ALIAS.has(code)) return 'EUR';
  return code;
}
