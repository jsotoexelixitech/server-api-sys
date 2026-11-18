// Reglas puras de las frecuencias de pago del plan (maplanes_frec y maplanes_frec_produc). Sin BD.
//
// maplanes_frec no tiene PK: la llave lógica es (cramo, cplan, ifrecuencia, ndias), con ndias NULL igual a 0.
// Datos de Sis2000_QA (18-nov-2026): ndias se usa también fuera de la letra D (A con 180/365/547/730 días,
// E «ÚNICA» con 3 a 8 días) y la D lleva -30 para «más de 30 días»; por eso ndias es entero con signo.

/** Letras de frecuencia aceptadas (se guardan en mayúscula). */
export const LETRAS_FRECUENCIA = ['A', 'S', 'T', 'C', 'M', 'E', 'K', 'D'] as const;

/** Descripción por defecto de cada letra, tal como aparece en los datos de Sis2000 (D no tiene: depende de ndias). */
export const DESCRIPCION_FRECUENCIA: Record<string, string> = {
  A: 'ANUAL',
  S: 'SEMESTRAL',
  T: 'TRIMESTRAL',
  C: 'CUATRIMESTRAL',
  M: 'MENSUAL',
  E: 'UNICA',
  K: '4 CUOTAS MENSUALES (POSTPAGO)',
};

export interface AltaFrecuencia {
  ifrecuencia: string;
  xfrecuencia?: string | null;
  ndias?: number | null;
  itipo?: string | null;
}

export interface EdicionFrecuencia {
  ndias?: number | null;
  xfrecuencia?: string | null;
  ndiasNuevo?: number | null;
  iestado?: string | null;
}

/** Letra recortada y en mayúscula ('' si no viene). */
export const normalizarLetra = (v: unknown) => String(v ?? '').trim().toUpperCase();

/** ndias tal como entra en la llave lógica: NULL cuenta como 0. */
export const ndiasLlave = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));

const enteroValido = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 99999;

/** Descripción final del alta: la enviada o la de la letra (D: «Hasta N días»). */
export function descripcionAlta(dto: AltaFrecuencia): string {
  const enviada = String(dto.xfrecuencia ?? '').trim();
  if (enviada) return enviada;
  const letra = normalizarLetra(dto.ifrecuencia);
  if (letra === 'D' && dto.ndias != null) return dto.ndias < 0 ? `Más de ${-dto.ndias} días` : `Hasta ${dto.ndias} días`;
  return DESCRIPCION_FRECUENCIA[letra] ?? '';
}

/** Errores del alta (letra, ndias obligatorio en D, descripción ≤ 150, itipo de una letra). */
export function validarAltaFrecuencia(dto: AltaFrecuencia): string[] {
  const errores: string[] = [];
  const letra = normalizarLetra(dto.ifrecuencia);
  if (!(LETRAS_FRECUENCIA as readonly string[]).includes(letra)) {
    errores.push(`ifrecuencia debe ser una de ${LETRAS_FRECUENCIA.join('/')} (llegó «${String(dto.ifrecuencia ?? '').trim()}»).`);
  }
  if (dto.ndias != null && !enteroValido(dto.ndias)) errores.push('ndias debe ser un número entero.');
  if (letra === 'D' && (dto.ndias == null || dto.ndias === 0)) {
    errores.push('ndias es obligatorio (y distinto de 0) en la frecuencia D (por días).');
  }
  const x = descripcionAlta(dto);
  if (!x) errores.push('xfrecuencia es obligatoria.');
  if (x.length > 150) errores.push('xfrecuencia admite hasta 150 caracteres.');
  if (dto.itipo != null && String(dto.itipo).trim().length > 1) errores.push('itipo es de un carácter.');
  return errores;
}

/** Errores de la edición: al menos un campo; iestado V o I; descripción no vacía ≤ 150; ndias enteros. */
export function validarEdicionFrecuencia(dto: EdicionFrecuencia, letra: string): string[] {
  const errores: string[] = [];
  const cambia = dto.xfrecuencia !== undefined || dto.ndiasNuevo !== undefined || dto.iestado !== undefined;
  if (!cambia) errores.push('No hay campos para actualizar (xfrecuencia, ndiasNuevo o iestado).');
  if (dto.ndias != null && !enteroValido(dto.ndias)) errores.push('ndias debe ser un número entero.');
  if (dto.ndiasNuevo != null && !enteroValido(dto.ndiasNuevo)) errores.push('ndiasNuevo debe ser un número entero.');
  if (normalizarLetra(letra) === 'D' && dto.ndiasNuevo !== undefined && (dto.ndiasNuevo == null || dto.ndiasNuevo === 0)) {
    errores.push('La frecuencia D necesita ndias distinto de 0.');
  }
  if (dto.xfrecuencia !== undefined) {
    const x = String(dto.xfrecuencia ?? '').trim();
    if (!x) errores.push('xfrecuencia no puede quedar vacía.');
    if (x.length > 150) errores.push('xfrecuencia admite hasta 150 caracteres.');
  }
  if (dto.iestado !== undefined && !['V', 'I'].includes(String(dto.iestado ?? '').trim().toUpperCase())) {
    errores.push("iestado debe ser 'V' o 'I'.");
  }
  return errores;
}

/** Fila leída de maplanes_frec. */
export interface FilaFrecuencia {
  ifrecuencia: string;
  ndias: number | null;
  iestado: string;
}

/**
 * Qué fila edita el PATCH entre las que tienen la misma letra (y ndias, si vino): la única que haya, o pide
 * desambiguar. Devuelve el ndias de la llave a editar o un error.
 */
export function elegirFilaFrecuencia(
  filas: FilaFrecuencia[], letra: string, ndias: number | null | undefined,
): { ndias: number } | { error: string; conflicto: boolean } {
  const l = normalizarLetra(letra);
  const candidatas = filas.filter((f) => normalizarLetra(f.ifrecuencia) === l && (ndias === undefined || ndiasLlave(f.ndias) === ndiasLlave(ndias)));
  if (!candidatas.length) {
    return { error: `El plan no tiene la frecuencia ${l}${ndias !== undefined ? ` con ndias ${ndiasLlave(ndias)}` : ''}.`, conflicto: false };
  }
  const llaves = [...new Set(candidatas.map((f) => ndiasLlave(f.ndias)))];
  if (llaves.length > 1) {
    return { error: `El plan tiene la frecuencia ${l} con varios ndias (${llaves.join(', ')}): envía ndias para elegir la fila.`, conflicto: true };
  }
  const editables = candidatas.filter((f) => ['V', 'I'].includes(String(f.iestado ?? '').trim()));
  if (!editables.length) return { error: `La frecuencia ${l} no está 'V' ni 'I' (no se modifica).`, conflicto: true };
  if (editables.filter((f) => f.iestado.trim() === 'V').length > 1) {
    return { error: `Hay más de una fila 'V' de la frecuencia ${l} con ndias ${llaves[0]}: corrígelo en Sis2000.`, conflicto: true };
  }
  return { ndias: llaves[0] };
}

/** Frecuencia propia de un productor (maplanes_frec_produc). */
export interface AltaFrecuenciaProductor extends AltaFrecuencia {
  cproductor: number;
}

export function validarAltaFrecuenciaProductor(dto: AltaFrecuenciaProductor): string[] {
  const errores = validarAltaFrecuencia(dto);
  if (!Number.isInteger(dto.cproductor) || dto.cproductor <= 0 || dto.cproductor > 9999999999) {
    errores.push('cproductor debe ser un entero positivo (NUMERIC(10)).');
  }
  return errores;
}
