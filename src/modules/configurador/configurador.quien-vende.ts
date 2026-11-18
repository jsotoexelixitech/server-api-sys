// Reglas puras de «quién vende» el plan (mausuplan). Sin BD.
//
// mausuplan: id INT sin identity (MAX+1), centidad, citem VARCHAR(50) (NULL = todos los de esa entidad), cramo INT,
// cplan NVARCHAR(25), itipouso (A = incluye, E = excluye). Datos de Sis2000_QA (18-nov-2026): P ~29,7k, C ~3,8k,
// G ~63k; R (95), U (1) y A (2) sin significado confirmado: se muestran pero no se editan.

/** Entidades que se pueden dar de alta o baja desde el configurador. */
export const ENTIDADES_EDITABLES = ['P', 'C', 'G'] as const;
export type EntidadEditable = (typeof ENTIDADES_EDITABLES)[number];

/** Nombre de cada centidad (las no confirmadas quedan como tales). */
export const NOMBRE_ENTIDAD: Record<string, string> = {
  P: 'productor',
  C: 'canal',
  G: 'gestor',
  R: 'no confirmado',
  U: 'no confirmado',
  A: 'no confirmado',
};

/** Máximo de items por alta o baja (van en un solo parámetro JSON, sin límite de 2100 parámetros). */
export const MAX_ITEMS = 5000;
/** Paginado del listado. */
export const LIMITE_POR_DEFECTO = 50;
export const LIMITE_MAXIMO = 500;

export interface CambioQuienVende {
  centidad?: string | null;
  itipouso?: string | null;
  items?: (string | null)[] | null;
}

export const esEditable = (centidad: unknown): centidad is EntidadEditable =>
  (ENTIDADES_EDITABLES as readonly string[]).includes(String(centidad ?? '').trim().toUpperCase());

/** Items recortados y sin repetir; null = «todos» (fila con citem NULL). */
export function normalizarItems(items: (string | null)[] | null | undefined): string[] | null {
  if (items == null) return null;
  return [...new Set(items.map((i) => String(i ?? '').trim()))];
}

/**
 * Errores de un alta o una baja: entidad P/C/G, itipouso A/E, items presente (null = todos) y con códigos válidos.
 * P y C son numéricos (maproduc.cproductor, macanalalt.ccanalalt SMALLINT); G es texto (magestor.cgestor).
 * Una exclusión (E) de «todos» no tiene efecto en spBuscaPlan (compara citem = @citem), así que se rechaza.
 */
export function validarCambioQuienVende(dto: CambioQuienVende, operacion: 'alta' | 'baja'): string[] {
  const errores: string[] = [];
  const centidad = String(dto.centidad ?? '').trim().toUpperCase();
  const itipouso = String(dto.itipouso ?? '').trim().toUpperCase();
  if (!esEditable(centidad)) {
    errores.push(`centidad debe ser P (productor), C (canal) o G (gestor)${centidad ? `; ${centidad} solo se muestra` : ''}.`);
  }
  if (!['A', 'E'].includes(itipouso)) errores.push("itipouso debe ser 'A' (incluye) o 'E' (excluye).");
  if (dto.items === undefined) {
    errores.push('items es obligatorio: una lista de códigos o null para «todos».');
    return errores;
  }
  const items = normalizarItems(dto.items);
  if (items === null) {
    if (itipouso === 'E' && operacion === 'alta') errores.push('No se puede excluir a «todos»: indica los códigos a excluir.');
    return errores;
  }
  if (!items.length) errores.push('items no puede ser una lista vacía (usa null para «todos»).');
  if (items.length > MAX_ITEMS) errores.push(`Máximo ${MAX_ITEMS} items por operación.`);
  if (items.some((i) => !i)) errores.push('items no puede tener códigos vacíos.');
  if (items.some((i) => i.length > 50)) errores.push('Cada item admite hasta 50 caracteres.');
  if (centidad === 'P' && items.some((i) => i && !/^\d{1,11}$/.test(i))) errores.push('Los productores (P) son códigos numéricos.');
  if (centidad === 'C' && items.some((i) => i && (!/^\d{1,5}$/.test(i) || Number(i) > 32767))) {
    errores.push('Los canales (C) son códigos numéricos (macanalalt.ccanalalt).');
  }
  return errores;
}

/** limit (1-500, por defecto 50) y offset (≥ 0) del listado. */
export function paginado(limit?: unknown, offset?: unknown): { limit: number; offset: number } {
  const l = Number(limit);
  const o = Number(offset);
  return {
    limit: Number.isFinite(l) && l >= 1 ? Math.min(Math.trunc(l), LIMITE_MAXIMO) : LIMITE_POR_DEFECTO,
    offset: Number.isFinite(o) && o > 0 ? Math.trunc(o) : 0,
  };
}

export interface GrupoResumen {
  centidad: string;
  itipouso: string;
  filas: number;
  todos: number;
}

/** Resumen por centidad + itipouso, con nombre, si hay fila «todos» y si se puede editar; más avisos. */
export function armarResumen(grupos: GrupoResumen[]) {
  const salida = grupos.map((g) => ({
    centidad: g.centidad,
    entidad: NOMBRE_ENTIDAD[g.centidad] ?? 'no confirmado',
    itipouso: g.itipouso,
    filas: g.filas,
    conTodos: g.todos > 0,
    editable: esEditable(g.centidad),
  }));
  const avisos: string[] = [];
  if (!grupos.some((g) => g.itipouso === 'A' && g.filas > 0)) avisos.push("El plan no tiene ninguna fila 'A': nadie lo puede vender.");
  const raras = [...new Set(grupos.filter((g) => !esEditable(g.centidad)).map((g) => g.centidad))];
  if (raras.length) avisos.push(`Hay filas con centidad ${raras.join(', ')} (significado no confirmado): se muestran pero no se editan.`);
  return { total: grupos.reduce((s, g) => s + g.filas, 0), grupos: salida, avisos };
}

/** Avisos cuando un item queda a la vez incluido (A) y excluido (E) para la misma entidad. */
export function avisosContrarios(centidad: string, itipouso: string, contrarios: (string | null)[]): string[] {
  if (!contrarios.length) return [];
  const otro = itipouso === 'A' ? 'excluidos (E)' : 'incluidos (A)';
  const lista = contrarios.map((c) => (c == null ? '«todos»' : c)).join(', ');
  return [`${NOMBRE_ENTIDAD[centidad] ?? centidad}: ${lista} también está(n) ${otro} en este plan; la exclusión manda en spBuscaPlan.`];
}
