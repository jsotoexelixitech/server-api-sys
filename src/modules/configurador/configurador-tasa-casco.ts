// Tasa de casco por características (ramo 18, coberturas 1/2/28): reglas puras sobre el tarificador de Sis2000
// (tarifa_casco_versiones + sp_tarifa_casco_*). El configurador no escribe en macalcasco/macobtipo/marangosum/marangoano:
// todo pasa por los SP, que llevan su propia transacción, applock, permisos y auditoría (created_by/updated_by).

/** SP públicos del tarificador que usa el configurador (parámetros tomados de esquema-sis2000-qa). */
export const SP_CASCO = {
  vistaPrevia: 'dbo.sp_tarifa_casco_vista_previa',
  ajustar: 'dbo.sp_tarifa_casco_ajustar',
  restaurar: 'dbo.sp_tarifa_casco_restaurar',
  revisar: 'dbo.sp_tarifa_casco_revisar',
  cancelar: 'dbo.sp_tarifa_casco_cancelar',
} as const;

export const MOVIMIENTOS = ['INCREMENTO', 'DISMINUCION'] as const;
export const ALCANCES = ['GLOBAL', 'TIPO_VEHICULO', 'COBERTURA', 'ANTIGUEDAD', 'SUMA_ASEGURADA', 'COMBINADA'] as const;
export const ORIGENES = ['AJUSTE', 'RESTAURACION'] as const;

/** Filtros del ajuste tal como los lee sp_tarifa_casco_validar_ajuste (OPENJSON con estos nombres). */
export interface FiltrosCasco {
  vehicleTypes?: number[];
  coverages?: string[];
  ranges?: number[];
  ageFrom?: number;
  ageTo?: number;
}

/** JSON de filtros para el SP: null si no hay ninguno; solo las llaves conocidas. */
export function filtrosJson(f?: FiltrosCasco | null): string | null {
  if (!f) return null;
  const limpio: FiltrosCasco = {};
  if (f.vehicleTypes?.length) limpio.vehicleTypes = f.vehicleTypes;
  if (f.coverages?.length) limpio.coverages = f.coverages.map((c) => String(c).trim());
  if (f.ranges?.length) limpio.ranges = f.ranges;
  if (f.ageFrom != null) limpio.ageFrom = f.ageFrom;
  if (f.ageTo != null) limpio.ageTo = f.ageTo;
  return Object.keys(limpio).length ? JSON.stringify(limpio) : null;
}

export interface CrearVersionCasco {
  origen: (typeof ORIGENES)[number];
  movimiento?: string | null;
  porcentaje?: number | null;
  alcance?: string | null;
  version_id?: number | null;
  vigente_desde?: string | null;
  rige_al_aprobar?: boolean | null;
}

/**
 * Lo mínimo para elegir el SP (el resto lo valida el propio SP, que es la fuente de verdad): AJUSTE con movimiento,
 * porcentaje y alcance; RESTAURACION con version_id; vigente_desde o rige_al_aprobar.
 */
export function validarCrearVersion(v: CrearVersionCasco): string[] {
  const errores: string[] = [];
  if (v.origen === 'AJUSTE') {
    if (!v.movimiento || !(MOVIMIENTOS as readonly string[]).includes(v.movimiento)) errores.push('movimiento debe ser INCREMENTO o DISMINUCION.');
    if (v.porcentaje == null) errores.push('porcentaje es obligatorio en un AJUSTE.');
    if (!v.alcance || !(ALCANCES as readonly string[]).includes(v.alcance)) errores.push(`alcance debe ser uno de ${ALCANCES.join(', ')}.`);
    if (v.version_id != null) errores.push('version_id solo aplica a una RESTAURACION.');
  } else if (v.origen === 'RESTAURACION') {
    if (v.version_id == null) errores.push('version_id (la versión APLICADA a restaurar) es obligatorio en una RESTAURACION.');
    if (v.movimiento != null || v.porcentaje != null || v.alcance != null) errores.push('movimiento, porcentaje y alcance solo aplican a un AJUSTE.');
  } else {
    errores.push('origen debe ser AJUSTE o RESTAURACION.');
  }
  if (!v.vigente_desde && v.rige_al_aprobar !== true) errores.push('Indica vigente_desde o rige_al_aprobar: true.');
  return errores;
}

/**
 * HTTP de los THROW del tarificador (5010x-5012x): permisos → 403; estado de la versión o del flujo → 409; datos
 * del ajuste → 400. null = no es del tarificador (lo traduce errorSql).
 */
export function estadoHttpCasco(numero: number | undefined): 400 | 403 | 409 | null {
  if (numero == null) return null;
  if ([50101, 50102].includes(numero)) return 403;
  if ([50103, 50104, 50107, 50108, 50110, 50111, 50113, 50117, 50119, 50121, 50122].includes(numero)) return 409;
  if (numero >= 50100 && numero <= 50199) return 400;
  return null;
}

/** No hay SP para grabar valores sueltos en una versión: se responde 501 con esta razón. */
export const MENSAJE_CASCO_VALORES =
  'Sis2000 no tiene un SP para grabar valores por celda en una versión de la tasa de casco. Las versiones nacen de un ' +
  'ajuste porcentual (sp_tarifa_casco_ajustar: POST …/versiones con origen AJUSTE) o de restaurar una versión aplicada ' +
  '(sp_tarifa_casco_restaurar: origen RESTAURACION). sp_tarifa_casco_escribir_valores es de uso interno (lo llaman ' +
  'sp_tarifa_casco_aplicar y sp_tarifa_casco_cerrar_vigencia dentro de su transacción y applock) y llamarlo desde fuera ' +
  'saltaría la aprobación. Pendiente: un SP de La Mundial para proponer valores por celda.';

export const AVISO_CASCO_GLOBAL =
  'El versionado de la tasa de casco es global: cada versión copia TODO marangoano y macobtipo (la llave no lleva ' +
  'cramo) y fn_buscar_tasa_casco solo lee el ramo 18. Un ajuste afecta a todos los planes con tasa por características.';
