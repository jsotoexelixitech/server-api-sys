// Reglas puras de la tarifa por días (maplantar_dias, R.C. Binacional). sp_calculo_auto_nexus (placa B) busca la fila
// con ndias_max = días de la vigencia y ctarifabi del vehículo; con vigencia anual usa @qdias = 30 → la fila con
// ndias_max 30 y su mprima_anual. Datos de Sis2000_QA: tramos 0-3, 3-7, 7-15 y 15-30 (qdias 1..4) por ctarifabi.

export interface FilaDias {
  ctarifabi: number;
  qdias: number;
  bnacional: boolean;
  cmoneda?: string | null;
  ndias_min: number;
  ndias_max: number;
  msuma?: number | null;
  mprima?: number | null;
  mprima_anual?: number | null;
  mprima_dia?: number | null;
}

/** ndias_max de la fila anual: el SP pone @qdias = 30 cuando la vigencia es de 12 meses. */
export const NDIAS_ANUAL = 30;
/** NUMERIC(4) de ndias_min/ndias_max. */
const MAX_DIAS = 9999;

export const esPlanBinacional = (cplan: string) => /^BINAC/i.test(String(cplan ?? '').trim());

const grupo = (f: Pick<FilaDias, 'ctarifabi' | 'bnacional'>) => `tarifa ${f.ctarifabi} / ${f.bnacional ? 'nacional' : 'internacional'}`;

/**
 * Errores de un reemplazo de filas de (plan, cobertura, tarifa):
 * - enteros no negativos (ctarifabi, qdias, días) y montos ≥ 0; ndias_max > ndias_min;
 * - sin repetir la PK (ctarifabi, qdias, bnacional);
 * - los rangos de días por (ctarifabi, bnacional) no se solapan (el siguiente empieza en o después del máximo anterior:
 *   0-3 y 3-7 es válido, como en los datos);
 * - plan BINAC*: cada (ctarifabi, bnacional) tiene la fila anual (ndias_max 30) con mprima_anual, y la lista no puede ir vacía.
 */
export function validarFilasDias(filas: FilaDias[], cplan: string): string[] {
  const errores: string[] = [];
  const binac = esPlanBinacional(cplan);
  if (!filas.length) {
    if (binac) errores.push(`El plan ${cplan.trim()} es Binacional: necesita al menos la fila anual (ndias_max ${NDIAS_ANUAL}).`);
    return errores;
  }
  const enteros: Array<keyof FilaDias> = ['ctarifabi', 'qdias', 'ndias_min', 'ndias_max'];
  const montos: Array<keyof FilaDias> = ['msuma', 'mprima', 'mprima_anual', 'mprima_dia'];
  const pk = new Set<string>();
  filas.forEach((f, i) => {
    const n = `Fila ${i + 1} (${grupo(f)}, qdias ${f.qdias})`;
    for (const c of enteros) {
      const v = f[c];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || ((c === 'ndias_min' || c === 'ndias_max') && v > MAX_DIAS)) {
        errores.push(`${n}: ${c} debe ser un entero ≥ 0${c.startsWith('ndias') ? ` y ≤ ${MAX_DIAS}` : ''}.`);
      }
    }
    for (const c of montos) {
      const v = f[c];
      if (v != null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) errores.push(`${n}: ${c} debe ser ≥ 0.`);
    }
    if (f.ndias_max <= f.ndias_min) errores.push(`${n}: ndias_max (${f.ndias_max}) debe ser mayor que ndias_min (${f.ndias_min}).`);
    if (f.cmoneda != null && String(f.cmoneda).trim().length > 3) errores.push(`${n}: cmoneda admite hasta 3 caracteres.`);
    const k = `${f.ctarifabi}|${f.qdias}|${f.bnacional ? 1 : 0}`;
    if (pk.has(k)) errores.push(`${n}: repetida (ctarifabi, qdias, bnacional es la llave).`);
    pk.add(k);
  });

  const grupos = new Map<string, FilaDias[]>();
  for (const f of filas) grupos.set(grupo(f), [...(grupos.get(grupo(f)) ?? []), f]);
  for (const [g, lista] of grupos) {
    const orden = [...lista].sort((a, b) => a.ndias_min - b.ndias_min || a.ndias_max - b.ndias_max);
    for (let i = 1; i < orden.length; i++) {
      const [a, b] = [orden[i - 1], orden[i]];
      if (b.ndias_min < a.ndias_max) errores.push(`${g}: el rango ${b.ndias_min}-${b.ndias_max} se solapa con ${a.ndias_min}-${a.ndias_max}.`);
    }
    if (binac) {
      const anual = lista.find((f) => f.ndias_max === NDIAS_ANUAL);
      if (!anual) errores.push(`${g}: falta la fila anual (ndias_max ${NDIAS_ANUAL}); la emisión anual del Binacional no la encuentra.`);
      else if (anual.mprima_anual == null) errores.push(`${g}: la fila anual (ndias_max ${NDIAS_ANUAL}) necesita mprima_anual.`);
    }
  }
  return errores;
}

/** Avisos (no bloquean): fila anual de un BINAC con mprima_anual 0 (la prima saldría solo de la tasa por puesto de maplantar). */
export function avisosFilasDias(filas: FilaDias[], cplan: string): string[] {
  if (!esPlanBinacional(cplan)) return [];
  return filas
    .filter((f) => f.ndias_max === NDIAS_ANUAL && f.mprima_anual === 0)
    .map((f) => `${grupo(f)}: la fila anual tiene mprima_anual 0; la prima anual saldrá solo de la tasa por puesto de maplantar.`);
}
