/**
 * `adpoliza.cpoliza` es NUMERIC(19) y la mayoría de las pólizas pasan de Number.MAX_SAFE_INTEGER (2^53):
 * como number de JS se redondea (1800000000000234032 → 1800000000000234000) y apunta a otra póliza.
 * Leerlo en SQL con `CONVERT(VARCHAR(20), cpoliza)` y manejarlo como texto con esta función.
 *
 * Devuelve el número como texto de solo dígitos, sin ceros a la izquierda, o undefined si viene vacío,
 * no es entero positivo o ya llegó como number inseguro (redondeado, no se puede recuperar).
 */
export function cpolizaTexto(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  }
  if (typeof value === 'bigint') return value > 0n ? value.toString() : undefined;
  const text = String(value).trim().replace(/\.0+$/, '');
  if (!/^\d{1,19}$/.test(text)) return undefined;
  const sinCeros = text.replace(/^0+/, '');
  return sinCeros === '' ? undefined : sinCeros;
}
