export interface CiudadRow {
  cciudad: number;
  xdescripcion_l: string;
}

/**
 * Deja una sola fila por cciudad (la primera). Un código de ciudad repetido en el
 * mismo estado haría que el combo del Formulario muestre otra ciudad al elegir por código.
 */
export function dedupeCities<T extends CiudadRow>(rows: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.cciudad) || seen.has(r.cciudad)) continue;
    seen.add(r.cciudad);
    out.push(r);
  }
  return out;
}
