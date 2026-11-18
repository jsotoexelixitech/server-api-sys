// Familia de un ramo (auto, personas, patrimonial o fianzas), su estado, el SP de emisión Nexus que le sirve y las
// secciones del configurador que se activan. Reglas puras: el service solo trae los indicadores de la BD.

export type FamiliaRamo = 'auto' | 'personas' | 'patrimonial' | 'fianzas';
export type EmisionNexus = 'auto' | 'personas' | 'patrimonial' | null;
export type EstadoRamo = 'activo' | 'sin-planes' | 'inactivo';

/** maramos.ctiporamo por familia (Sis2000_QA: 7 = ramo 18; 2/4 = personas; 5 = ramo 30; 1/6 = patrimoniales). */
export const CTIPORAMO_FAMILIA: Record<FamiliaRamo, number[]> = {
  auto: [7],
  personas: [2, 4],
  fianzas: [5],
  patrimonial: [1, 6],
};

export interface IndicadoresFamilia {
  /** maramos.ctiporamo (null si no viene). */
  ctiporamo?: number | null;
  /** El ramo tiene filas en matipos o en macattip. */
  tieneTiposAuto: boolean;
  /** Coberturas del ramo en macoberturas. */
  coberturas?: number;
  /**
   * Coberturas del ramo que equivalen a una del ramo 18: mismo macoberturas.cramoint y ccoberturaint (así las une
   * sp_calculo_auto_nexus). Si TODAS equivalen, el ramo se cotiza por la ruta de auto (caso del ramo 26, RCV).
   */
  coberturasHacia18?: number;
  /** maramos.iplanpers (BIT; puede llegar como boolean, número o texto). Solo cuenta si ctiporamo no se conoce. */
  iplanpers?: unknown;
  /** El ramo tiene planes en maplanes_per (cualquier estado). */
  tienePlanesPersonas: boolean;
}

const verdadero = (v: unknown) => v === true || v === 1 || ['1', 'true', 's', 't'].includes(String(v ?? '').trim().toLowerCase());
const tipoRamo = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Todas las coberturas del ramo equivalen a una del ramo 18 (y tiene al menos una). */
export const coberturasHaciaAuto = (ind: IndicadoresFamilia) =>
  (ind.coberturas ?? 0) > 0 && ind.coberturasHacia18 === ind.coberturas;

/**
 * Por maramos.ctiporamo (7 auto, 2/4 personas, 5 fianzas, 1/6 patrimonial), con dos reglas encima:
 * - auto si el ramo tiene matipos/macattip, o si no es de personas ni fianzas y todas sus coberturas equivalen a una
 *   del ramo 18 por cramoint + ccoberturaint (ramo 26 RCV: ctiporamo 1 y sus 9 coberturas apuntan al ramo 18);
 * - ctiporamo desconocido: personas si iplanpers o planes en maplanes_per; si no, patrimonial (regla de la fase 1).
 */
export function familiaDelRamo(ind: IndicadoresFamilia): FamiliaRamo {
  const t = tipoRamo(ind.ctiporamo);
  if (ind.tieneTiposAuto || (t != null && CTIPORAMO_FAMILIA.auto.includes(t))) return 'auto';
  const personasOFianzas = t != null && [...CTIPORAMO_FAMILIA.personas, ...CTIPORAMO_FAMILIA.fianzas].includes(t);
  if (!personasOFianzas && coberturasHaciaAuto(ind)) return 'auto';
  for (const f of ['personas', 'fianzas', 'patrimonial'] as const) {
    if (t != null && CTIPORAMO_FAMILIA[f].includes(t)) return f;
  }
  if (verdadero(ind.iplanpers) || ind.tienePlanesPersonas) return 'personas';
  return 'patrimonial';
}

export interface DatosRamo extends IndicadoresFamilia {
  /** maramos.iestado. */
  iestado?: string | null;
  /** Planes distintos con iestado 'V' en maplanes o maplanes_per. */
  planesVigentes: number;
  /** El ramo tiene fila en insramo (numeración de recibos y pólizas). */
  tieneInsramo: boolean;
}

/**
 * Colectivo: personas cuyos planes viven solo en la póliza plantilla, no en maplanes_per. Regla: ramo de personas
 * vigente, sin planes en maplanes_per y con numeración en insramo (opera, pero no por planes). En Sis2000_QA da
 * 4, 6, 8, 43 y 46; deja fuera 2 y 3 (inactivos) y 34/35 (solidarios sin insramo: no están configurados).
 */
export function esColectivo(familia: FamiliaRamo, d: DatosRamo): boolean {
  return familia === 'personas' && String(d.iestado ?? '').trim() === 'V' && !d.tienePlanesPersonas && d.tieneInsramo;
}

/** SP de emisión Nexus: auto; personas salvo colectivos; patrimonial si ctiporamo 1/6 (ruta de riesgos generales); fianzas nada. */
export function emisionNexusDe(familia: FamiliaRamo, colectivo: boolean, ctiporamo?: number | null): EmisionNexus {
  if (familia === 'auto') return 'auto';
  if (familia === 'personas') return colectivo ? null : 'personas';
  const t = tipoRamo(ctiporamo);
  if (familia === 'patrimonial') return t != null && CTIPORAMO_FAMILIA.patrimonial.includes(t) ? 'patrimonial' : null;
  return null;
}

/** inactivo si maramos.iestado ≠ 'V'; activo si tiene planes 'V'; sin-planes en otro caso. */
export function estadoDelRamo(d: Pick<DatosRamo, 'iestado' | 'planesVigentes'>): EstadoRamo {
  if (String(d.iestado ?? '').trim() !== 'V') return 'inactivo';
  return d.planesVigentes > 0 ? 'activo' : 'sin-planes';
}

export const AVISO_FIANZAS = 'Sin flujo de emisión Nexus (fianzas): el configurador solo muestra los datos.';
export const AVISO_COLECTIVO = 'Ramo colectivo: los planes viven en la póliza plantilla, no en maplanes_per; sin emisión Nexus.';
export const AVISO_SIN_INSRAMO = 'Este ramo no tiene numeración de recibos configurada (insramo).';

/** Avisos informativos del ramo (no bloquean). */
export function avisosDelRamo(familia: FamiliaRamo, colectivo: boolean, estado: EstadoRamo, tieneInsramo: boolean): string[] {
  const avisos: string[] = [];
  if (familia === 'fianzas') avisos.push(AVISO_FIANZAS);
  if (colectivo) avisos.push(AVISO_COLECTIVO);
  if (estado === 'inactivo') avisos.push("El ramo está inactivo en maramos (iestado distinto de 'V').");
  if (estado === 'sin-planes' && !colectivo) avisos.push("El ramo no tiene planes vigentes ('V').");
  if (!tieneInsramo) avisos.push(AVISO_SIN_INSRAMO);
  return avisos;
}

export interface OpcionesSecciones {
  /** El ramo tiene filas en MATARIFA_ANTIGUEDAD/REPARTO/RANGO_NEXUS. */
  condominio?: boolean;
  /** El ramo tiene filas en maplantar_dias (fuera de auto: p. ej. ramo 28, planes BINAC). */
  tarifaDias?: boolean;
}

const SECCIONES_COMUNES = ['producto', 'plan', 'coberturas', 'tarifas', 'deducibles', 'frecuencias', 'quien-vende', 'comisiones'];
const SECCIONES_AUTO = ['tipos-uso', 'tasas-antiguedad', 'tasa-casco', 'tarifa-dias'];
const SECCIONES_PERSONAS = ['edades-parentesco', 'tablas-edad', 'proveedores'];

/**
 * Secciones en orden fijo: comunes, las de la familia y 'revision' al final. Personas sin 'deducibles' de plan.
 * Patrimonial: 'descuentos-recargos' y, solo si el ramo tiene filas, 'condominio' y 'tarifa-dias'. Fianzas: solo las
 * comunes (el ramo es de solo lectura).
 */
export function seccionesDeFamilia(familia: FamiliaRamo, op: OpcionesSecciones = {}): string[] {
  const comunes = familia === 'personas' ? SECCIONES_COMUNES.filter((s) => s !== 'deducibles') : SECCIONES_COMUNES;
  const propias =
    familia === 'auto' ? SECCIONES_AUTO
    : familia === 'personas' ? SECCIONES_PERSONAS
    : familia === 'patrimonial'
      ? ['descuentos-recargos', ...(op.condominio ? ['condominio'] : []), ...(op.tarifaDias ? ['tarifa-dias'] : [])]
      : [];
  return [...comunes, ...propias, 'revision'];
}

export interface RamoClasificado {
  cramo: number;
  xdescripcion: string;
  ctiporamo: number | null;
  familia: FamiliaRamo;
  colectivo: boolean;
  emisionNexus: EmisionNexus;
  estado: EstadoRamo;
  /** Planes distintos 'V' (maplanes + maplanes_per). */
  planes: number;
  /** Productos del ramo en maproductos. */
  productos: number;
  /** Fianzas: el configurador no escribe. */
  soloLectura: boolean;
  avisos: string[];
}

/** Clasificación completa de un ramo a partir de sus indicadores. */
export function clasificarRamo(
  d: DatosRamo & { cramo: number; xdescripcion: string; productos: number },
): RamoClasificado {
  const familia = familiaDelRamo(d);
  const colectivo = esColectivo(familia, d);
  const estado = estadoDelRamo(d);
  const ctiporamo = tipoRamo(d.ctiporamo);
  return {
    cramo: d.cramo,
    xdescripcion: d.xdescripcion,
    ctiporamo,
    familia,
    colectivo,
    emisionNexus: emisionNexusDe(familia, colectivo, ctiporamo),
    estado,
    planes: d.planesVigentes,
    productos: d.productos,
    soloLectura: familia === 'fianzas',
    avisos: avisosDelRamo(familia, colectivo, estado, d.tieneInsramo),
  };
}
