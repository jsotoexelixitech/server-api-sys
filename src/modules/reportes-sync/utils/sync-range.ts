const DIA_MS = 24 * 60 * 60 * 1000;

/** Días calendario de un rango, ambos extremos incluidos (el extract usa `< hasta + 1 día`). */
export function diasDelRango(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / DIA_MS) + 1;
}

/**
 * Cuántos tramos conviene para extraer en paralelo: no menos de `diasPorTramo` días cada uno
 * y no más de `maxTramos`. Devuelve 1 si no vale la pena partir.
 */
export function tramosParaRango(
  desde: Date | null | undefined,
  hasta: Date | null | undefined,
  maxTramos: number,
  diasPorTramo = 15,
): number {
  if (!(desde instanceof Date) || !(hasta instanceof Date)) return 1;
  if (!Number.isFinite(desde.getTime()) || !Number.isFinite(hasta.getTime()) || hasta < desde) return 1;
  const porDias = Math.floor(diasDelRango(desde, hasta) / Math.max(1, diasPorTramo));
  return Math.max(1, Math.min(Math.floor(maxTramos), porDias));
}

/**
 * Parte [desde, hasta] en `tramos` rangos de días completos, consecutivos y sin traslape que cubren
 * exactamente el rango original (los primeros reciben el día sobrante). Con `tramos <= 1` devuelve el rango.
 */
export function partirRango(
  desde: Date,
  hasta: Date,
  tramos: number,
): Array<{ desde: Date; hasta: Date }> {
  const dias = diasDelRango(desde, hasta);
  const n = Math.max(1, Math.min(Math.floor(tramos), dias));
  if (n <= 1) return [{ desde, hasta }];

  const base = Math.floor(dias / n);
  const sobrante = dias % n;
  const salida: Array<{ desde: Date; hasta: Date }> = [];
  let inicio = 0;
  for (let i = 0; i < n; i += 1) {
    const tamano = base + (i < sobrante ? 1 : 0);
    const d = new Date(desde.getTime() + inicio * DIA_MS);
    const h = i === n - 1 ? hasta : new Date(desde.getTime() + (inicio + tamano - 1) * DIA_MS);
    salida.push({ desde: d, hasta: h });
    inicio += tamano;
  }
  return salida;
}
