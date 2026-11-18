// Reglas puras de la familia auto: tasas por antigüedad (maplantar_ano), tipo y uso (macattip) y equivalencia de
// coberturas con el ramo 18 (como sp_calculo_auto_nexus: cob18 por macoberturas.ccoberturaint).

export interface TramoAntiguedad {
  desde: number;
  hasta: number;
  pprima: number;
}

/** smallint de nantiguedad_desde/hasta. */
const MAX_ANTIGUEDAD = 32767;

/**
 * Tramos de antigüedad del vehículo (años): empiezan en 0, sin huecos ni solapes (el siguiente desde = hasta + 1),
 * hasta ≥ desde y tasa > 0. Lista vacía = sin tramos (válida: el SP cae a la tasa del plan).
 */
export function validarTramosAntiguedad(tramos: TramoAntiguedad[]): string[] {
  const errores: string[] = [];
  if (!tramos.length) return errores;
  const orden = [...tramos].sort((a, b) => a.desde - b.desde);
  if (orden[0].desde !== 0) errores.push(`El primer tramo debe empezar en 0 años (empieza en ${orden[0].desde}).`);
  orden.forEach((t, i) => {
    const n = `Tramo ${t.desde}-${t.hasta}`;
    if (![t.desde, t.hasta].every((v) => Number.isInteger(v) && v >= 0 && v <= MAX_ANTIGUEDAD)) {
      errores.push(`${n}: desde y hasta deben ser enteros entre 0 y ${MAX_ANTIGUEDAD}.`);
    }
    if (t.hasta < t.desde) errores.push(`${n}: hasta es menor que desde.`);
    if (!(typeof t.pprima === 'number' && t.pprima > 0)) errores.push(`${n}: la tasa (pprima) debe ser mayor a 0.`);
    const previo = orden[i - 1];
    if (!previo) return;
    if (t.desde <= previo.hasta) errores.push(`${n}: se solapa con el tramo ${previo.desde}-${previo.hasta}.`);
    else if (t.desde > previo.hasta + 1) errores.push(`Hueco entre ${previo.hasta} y ${t.desde} años: el siguiente tramo debe empezar en ${previo.hasta + 1}.`);
  });
  return errores;
}

/** Coberturas de casco del ramo 18 que usan maplantar_ano: 1 CA, 2 PT, 28 PP. */
export const COBERTURAS_CASCO_18 = [1, 2, 28];

export interface CoberturaInt {
  ccobertura: string;
  ccoberturaint: number | null;
}

/**
 * Equivalente en el ramo 18 (cob18 de sp_calculo_auto_nexus): en el 18 es la misma cobertura; en otro ramo, la menor
 * cobertura del 18 con el mismo ccoberturaint. null = sin equivalente (el SP usa la fórmula general).
 */
export function equivalenteRamo18(cramo: number, cob: CoberturaInt, coberturas18: CoberturaInt[]): number | null {
  const propia = Number.parseInt(String(cob.ccobertura).trim(), 10);
  if (cramo === 18) return Number.isFinite(propia) ? propia : null;
  if (cob.ccoberturaint == null) return null;
  const candidatas = coberturas18
    .filter((c) => c.ccoberturaint != null && Number(c.ccoberturaint) === Number(cob.ccoberturaint))
    .map((c) => Number.parseInt(String(c.ccobertura).trim(), 10))
    .filter((n) => Number.isFinite(n));
  return candidatas.length ? Math.min(...candidatas) : null;
}

export const esCasco = (cob18: number | null | undefined) => cob18 != null && COBERTURAS_CASCO_18.includes(cob18);

/** Porcentajes de macattip (0 a 100). */
export const PORCENTAJES_TIPO_USO = ['ptasaexc', 'pdescuento', 'precarofic', 'precarinfl', 'precarremo'] as const;
/** Montos de macattip (≥ 0). */
export const MONTOS_TIPO_USO = [
  'mprimbas', 'mprimext', 'msumacosas', 'msumapers', 'msumacosasext', 'msumapersext', 'mtoneladas', 'mpuestos',
] as const;
/** Cantidades enteras de macattip: qmaxptos TINYINT, qmaxton SMALLINT. */
export const CANTIDADES_TIPO_USO: Record<'qmaxptos' | 'qmaxton', number> = { qmaxptos: 255, qmaxton: 32767 };

export type TipoUsoRegla = Partial<Record<(typeof PORCENTAJES_TIPO_USO)[number] | (typeof MONTOS_TIPO_USO)[number] | 'qmaxptos' | 'qmaxton', number | null>>;

/** Porcentajes entre 0 y 100, montos ≥ 0 y cantidades enteras en el rango de su columna. null/undefined no se valida. */
export function validarTipoUso(t: TipoUsoRegla): string[] {
  const errores: string[] = [];
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  for (const c of PORCENTAJES_TIPO_USO) {
    const v = t[c];
    if (v == null) continue;
    if (!num(v) || v < 0 || v > 100) errores.push(`${c} debe estar entre 0 y 100.`);
  }
  for (const c of MONTOS_TIPO_USO) {
    const v = t[c];
    if (v == null) continue;
    if (!num(v) || v < 0) errores.push(`${c} no puede ser negativo.`);
  }
  for (const [c, max] of Object.entries(CANTIDADES_TIPO_USO) as Array<['qmaxptos' | 'qmaxton', number]>) {
    const v = t[c];
    if (v == null) continue;
    if (!Number.isInteger(v) || v < 0 || v > max) errores.push(`${c} debe ser un entero entre 0 y ${max}.`);
  }
  return errores;
}
