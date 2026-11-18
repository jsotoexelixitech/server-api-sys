// Reglas puras de la edición del plan sin JSON: cabecera (maplanes / maplanes_per) y coberturas (maplancob +
// maplantar en cosas y auto; maplcober_per + mapltarifas_per en personas). Sin BD.

export interface CabeceraPlanEntrada {
  xplan?: string | null;
  cmoneda?: string | null;
  cproducto?: string | null;
  iestado?: string | null;
}

/** Errores de la cabecera: al menos un campo; xplan ≤ 60, cmoneda ≤ 4, cproducto ≤ 10 (no vacíos); iestado V/I. */
export function validarCabeceraPlan(dto: CabeceraPlanEntrada): string[] {
  const errores: string[] = [];
  const texto = (campo: keyof CabeceraPlanEntrada, max: number) => {
    const v = dto[campo];
    if (v === undefined) return;
    const s = String(v ?? '').trim();
    if (!s) errores.push(`${campo} no puede quedar vacío.`);
    else if (s.length > max) errores.push(`${campo} admite hasta ${max} caracteres.`);
  };
  if ([dto.xplan, dto.cmoneda, dto.cproducto, dto.iestado].every((v) => v === undefined)) {
    errores.push('No hay campos para actualizar (xplan, cmoneda, cproducto o iestado).');
  }
  texto('xplan', 60);
  texto('cmoneda', 4);
  texto('cproducto', 10);
  if (dto.iestado !== undefined && !['V', 'I'].includes(String(dto.iestado ?? '').trim().toUpperCase())) {
    errores.push("iestado debe ser 'V' o 'I'.");
  }
  return errores;
}

/** Avisos de la cabecera (no bloquean): producto de más de 6 caracteres o de otro ramo. */
export function avisosCabecera(cproducto: string | null | undefined, ramoProducto: number | null, cramo: number): string[] {
  const avisos: string[] = [];
  const c = String(cproducto ?? '').trim();
  if (c && c.length > 6) avisos.push(`El producto ${c} tiene más de 6 caracteres: spMantPlanes y la revisión solo admiten 6.`);
  if (c && ramoProducto != null && ramoProducto !== cramo) avisos.push(`El producto ${c} es del ramo ${ramoProducto}, no del ${cramo}.`);
  return avisos;
}

/** Código de cobertura o tarifa: 1 a 4 caracteres sin espacios. */
const codigoValido = (v: unknown) => /^\S{1,4}$/.test(String(v ?? '').trim());
const montoValido = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export interface MontosTarifaPlan {
  msumamin?: number | null;
  msumamax?: number | null;
  mprima?: number | null;
  pprima?: number | null;
}

/** Errores de montos: ≥ 0; mínimo ≤ máximo cuando ambos vienen y el máximo es > 0; prima y tasa excluyentes. */
export function validarMontosTarifa(m: MontosTarifaPlan): string[] {
  const errores: string[] = [];
  for (const k of ['msumamin', 'msumamax', 'mprima', 'pprima'] as const) {
    if (m[k] != null && !montoValido(m[k])) errores.push(`${k} debe ser un número mayor o igual a 0.`);
  }
  if (m.pprima != null && m.pprima > 100) errores.push('pprima (tasa) es un porcentaje: no puede pasar de 100.');
  if (m.msumamin != null && m.msumamax != null && m.msumamax > 0 && m.msumamin > m.msumamax) {
    errores.push('msumamin no puede ser mayor que msumamax.');
  }
  if ((m.mprima ?? 0) > 0 && (m.pprima ?? 0) > 0) errores.push('La prima (mprima) y la tasa (pprima) son excluyentes: envía solo una mayor que 0.');
  return errores;
}

export interface CoberturaCosasEntrada extends MontosTarifaPlan {
  ccobertura: string;
  ctarifa: string;
  bobligatoria?: boolean | null;
}

export function validarCoberturaCosas(dto: CoberturaCosasEntrada): string[] {
  const errores: string[] = [];
  if (!codigoValido(dto.ccobertura)) errores.push('ccobertura es obligatoria (1 a 4 caracteres).');
  if (!codigoValido(dto.ctarifa)) errores.push('ctarifa es obligatoria (1 a 4 caracteres).');
  return [...errores, ...validarMontosTarifa(dto)];
}

/**
 * Edición de suma, prima o tasa de la tarifa del plan. Al poner una prima > 0 la tasa pasa a 0 y viceversa (son
 * excluyentes); si vienen las dos > 0, error. Devuelve los campos a grabar y los ajustes hechos.
 */
export function edicionTarifaPlan(m: MontosTarifaPlan): { errores: string[]; campos: Partial<Record<keyof MontosTarifaPlan, number>>; ajustes: string[] } {
  const errores = validarMontosTarifa(m);
  const campos: Partial<Record<keyof MontosTarifaPlan, number>> = {};
  for (const k of ['msumamin', 'msumamax', 'mprima', 'pprima'] as const) if (m[k] != null) campos[k] = m[k] as number;
  if (!Object.keys(campos).length) errores.push('No hay campos para actualizar (msumamin, msumamax, mprima o pprima).');
  const ajustes: string[] = [];
  if ((campos.mprima ?? 0) > 0 && campos.pprima === undefined) { campos.pprima = 0; ajustes.push('pprima pasó a 0: la prima y la tasa son excluyentes.'); }
  if ((campos.pprima ?? 0) > 0 && campos.mprima === undefined) { campos.mprima = 0; ajustes.push('mprima pasó a 0: la prima y la tasa son excluyentes.'); }
  return { errores, campos, ajustes };
}

/** matarifa.bobligatoria: 'T' o '1' = obligatoria (en los datos también hay 'F', '0' y vacío). */
export const tarifaObligatoria = (v: unknown) => ['T', '1'].includes(String(v ?? '').trim().toUpperCase());

/** true si dar de baja `ccober` deja al plan sin coberturas obligatorias activas (y antes tenía). */
export function esUltimaObligatoria(activas: { ccober: string; obligatoria: boolean }[], ccober: string): boolean {
  const c = String(ccober ?? '').trim();
  const obligatorias = new Set(activas.filter((a) => a.obligatoria).map((a) => a.ccober.trim()));
  return obligatorias.has(c) && obligatorias.size === 1;
}

export interface ParentescoTarifa {
  cparen: number;
  ctablatar: string;
  csexo?: string | null;
}

export interface CoberturaPersonasEntrada {
  ccobertura: string;
  ctarifa: string;
  bobligatoria?: boolean | null;
  parentescos: ParentescoTarifa[];
}

/** Sexo de la tarifa por parentesco: A (ambos, el de casi todos los datos), M o F. */
export const sexoTarifa = (v: unknown) => (String(v ?? '').trim().toUpperCase() || 'A');

export function validarCoberturaPersonas(dto: CoberturaPersonasEntrada): string[] {
  const errores: string[] = [];
  if (!codigoValido(dto.ccobertura)) errores.push('ccobertura es obligatoria (1 a 4 caracteres).');
  if (!codigoValido(dto.ctarifa)) errores.push('ctarifa es obligatoria (1 a 4 caracteres).');
  const pars = dto.parentescos ?? [];
  if (!pars.length) errores.push('parentescos debe tener al menos un parentesco con su tabla de tasas.');
  const vistos = new Set<string>();
  for (const p of pars) {
    if (!Number.isInteger(p.cparen) || p.cparen < 0 || p.cparen > 32767) errores.push(`cparen inválido: ${p.cparen}.`);
    const t = String(p.ctablatar ?? '').trim();
    if (!t || t.length > 10) errores.push(`ctablatar del parentesco ${p.cparen} es obligatoria (máx. 10).`);
    const s = sexoTarifa(p.csexo);
    if (!['A', 'M', 'F'].includes(s)) errores.push(`csexo del parentesco ${p.cparen} debe ser A, M o F.`);
    const k = `${p.cparen}|${s}`;
    if (vistos.has(k)) errores.push(`El parentesco ${p.cparen} con sexo ${s} está repetido.`);
    vistos.add(k);
  }
  return errores;
}
