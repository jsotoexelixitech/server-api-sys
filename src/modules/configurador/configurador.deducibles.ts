// Deducible o franquicia de una tarifa (matarifa_d) o de la cobertura del plan (maplancob). Reglas puras.

export interface DeducibleRegla {
  /** 'D' deducible, 'F' franquicia; null o '0' = sin deducible. */
  bfraded?: string | null;
  mdedu_fran?: number | null;
  mdedu_franext?: number | null;
  pdedu_fran?: number | null;
}

/** true si el cuerpo trae algún campo de deducible con valor (null no cuenta). */
export const traeDeducible = (d: DeducibleRegla) =>
  [d.bfraded, d.mdedu_fran, d.mdedu_franext, d.pdedu_fran].some((v) => v !== undefined && v !== null);

/** Valor de bfraded para la BD: 'D'/'F' o '0' (sin deducible, como las tarifas existentes). */
export const bfradedBd = (v: string | null | undefined) => (v === 'D' || v === 'F' ? v : '0');

/** Montos ≥ 0, porcentaje entre 0 y 100, y si hay monto o porcentaje > 0 debe decir si es deducible o franquicia. */
export function validarDeducible(d: DeducibleRegla): string[] {
  const errores: string[] = [];
  if (d.bfraded != null && !['D', 'F', '0'].includes(d.bfraded)) errores.push("bfraded debe ser 'D' (deducible), 'F' (franquicia) o null.");
  for (const c of ['mdedu_fran', 'mdedu_franext'] as const) {
    const v = d[c];
    if (v != null && !(Number.isFinite(v) && v >= 0)) errores.push(`${c} no puede ser negativo.`);
  }
  if (d.pdedu_fran != null && !(Number.isFinite(d.pdedu_fran) && d.pdedu_fran >= 0 && d.pdedu_fran <= 100)) {
    errores.push('pdedu_fran debe estar entre 0 y 100.');
  }
  const hayValor = [d.mdedu_fran, d.mdedu_franext, d.pdedu_fran].some((v) => (v ?? 0) > 0);
  if (hayValor && d.bfraded !== undefined && bfradedBd(d.bfraded) === '0') {
    errores.push("Hay monto o porcentaje de deducible: indica bfraded 'D' (deducible) o 'F' (franquicia).");
  }
  return errores;
}

/** Edición de un detalle de tarifa: suma mínima ≤ máxima y fhasta ≥ fdesde (fechas YYYY-MM-DD). */
export function validarEdicionDetalle(fdesde: string, d: { msumamin?: number; msumamax?: number; fhasta?: string | null }): string[] {
  const errores: string[] = [];
  if (d.msumamin != null && d.msumamax != null && d.msumamin > d.msumamax) errores.push('msumamin es mayor que msumamax.');
  if (d.fhasta && d.fhasta < fdesde) errores.push('fhasta es anterior a fdesde.');
  return errores;
}
