// Comisiones del plan (maarancel). Reglas puras; la escritura está en configurador-comisiones.service.ts.
// Comodines de Sis2000: cplan '0' = todo el ramo, cproductor 0 = todos, ccober '0' = todas, ctarifa '0' = todas.

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface ComisionRegla {
  ctipoprod: number;
  cproductor: number;
  ccober: string;
  ctarifa: string;
  fdesde: string;
  pcomision: number;
}

/** Alta de una comisión: códigos válidos, fecha y porcentaje entre 0 y 100 con 2 decimales (NUMERIC(9,2)). */
export function validarComision(c: ComisionRegla): string[] {
  const errores: string[] = [];
  if (!Number.isInteger(c.ctipoprod) || c.ctipoprod < 0 || c.ctipoprod > 32767) errores.push('ctipoprod debe ser un entero entre 0 y 32767.');
  if (!Number.isInteger(c.cproductor) || c.cproductor < 0) errores.push('cproductor debe ser un entero ≥ 0 (0 = todos).');
  for (const [campo, v] of [['ccober', c.ccober], ['ctarifa', c.ctarifa]] as const) {
    const t = String(v ?? '').trim();
    if (!t || t.length > 4) errores.push(`${campo} debe tener entre 1 y 4 caracteres ('0' = todas).`);
  }
  if (!FECHA.test(c.fdesde ?? '') || Number.isNaN(Date.parse(c.fdesde))) errores.push('fdesde debe ser una fecha YYYY-MM-DD.');
  if (typeof c.pcomision !== 'number' || !Number.isFinite(c.pcomision) || c.pcomision < 0 || c.pcomision > 100) {
    errores.push('pcomision debe estar entre 0 y 100.');
  } else if (Math.abs(c.pcomision * 100 - Math.round(c.pcomision * 100)) > 1e-6) {
    errores.push('pcomision admite como máximo 2 decimales.');
  }
  return errores;
}

/** Baja: fhasta no puede ser anterior a fdesde. */
export function validarBajaComision(fdesde: string, fhasta: string): string[] {
  if (!FECHA.test(fhasta ?? '') || Number.isNaN(Date.parse(fhasta))) return ['fhasta debe ser una fecha YYYY-MM-DD.'];
  return fhasta < fdesde ? ['fhasta es anterior a fdesde.'] : [];
}

/** cplan '0' = fila del ramo (aplica a todos sus planes). */
export const aplicaA = (cplan: unknown): 'plan' | 'ramo' => (String(cplan ?? '').trim() === '0' ? 'ramo' : 'plan');

export interface FilaArancel {
  cplan: string;
  ccober: string;
  ctarifa: string;
  iestado?: string | null;
}

/**
 * Valores de `campo` (sin el comodín '0') con más de una fila 'V' en el ramo. Los SP unen maarancel por
 * cramo+ccober o cramo+ctarifa sin el plan: dos filas 'V' duplican la cobertura en el recibo. `soloEn` limita a los
 * códigos que interesan (p. ej. las coberturas del plan).
 */
export function duplicadosVigentes(filas: FilaArancel[], campo: 'ccober' | 'ctarifa', soloEn?: string[]): Array<{ codigo: string; filas: number }> {
  const filtro = soloEn ? new Set(soloEn.map((s) => s.trim())) : null;
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    if (String(f.iestado ?? '').trim() !== 'V') continue;
    const codigo = String(f[campo] ?? '').trim();
    if (!codigo || codigo === '0' || (filtro && !filtro.has(codigo))) continue;
    cuenta.set(codigo, (cuenta.get(codigo) ?? 0) + 1);
  }
  return [...cuenta.entries()].filter(([, n]) => n > 1).map(([codigo, n]) => ({ codigo, filas: n }));
}
