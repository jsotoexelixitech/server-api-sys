// Familia de un ramo (auto, personas o cosas) y secciones del configurador que se activan para ella.
// Reglas puras: el service solo trae los indicadores de la BD.

export type FamiliaRamo = 'auto' | 'personas' | 'cosas';

export interface IndicadoresFamilia {
  /** El ramo tiene filas en matipos o en macattip. */
  tieneTiposAuto: boolean;
  /** maramos.iplanpers (BIT; puede llegar como boolean, número o texto). */
  iplanpers?: unknown;
  /** El ramo tiene planes en maplanes_per. */
  tienePlanesPersonas: boolean;
}

const verdadero = (v: unknown) => v === true || v === 1 || ['1', 'true', 'S', 'T'].includes(String(v ?? '').trim());

/** auto si tiene tipos de vehículo; personas si iplanpers o planes de personas; cosas en otro caso. */
export function familiaDelRamo(ind: IndicadoresFamilia): FamiliaRamo {
  if (ind.tieneTiposAuto) return 'auto';
  if (verdadero(ind.iplanpers) || ind.tienePlanesPersonas) return 'personas';
  return 'cosas';
}

const SECCIONES_BASE = ['coberturas', 'tarifas', 'deducibles', 'frecuencias', 'canales', 'comisiones'];
const SECCIONES_AUTO = ['tipos-uso', 'tasas-antiguedad'];

/** Secciones en orden fijo; auto agrega tipos-uso y tasas-antiguedad antes de revision. */
export function seccionesDeFamilia(familia: FamiliaRamo): string[] {
  return [...SECCIONES_BASE, ...(familia === 'auto' ? SECCIONES_AUTO : []), 'revision'];
}
