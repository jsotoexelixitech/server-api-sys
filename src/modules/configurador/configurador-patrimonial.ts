// Reglas puras de la familia patrimonial: descuentos por dispositivos de seguridad (madisseg), recargos por sustancias
// peligrosas (masustac) y lectura de las tablas de condominio (MATARIFA_*_NEXUS).

import { TABLAS_CONDOMINIO, type TablaCondominio } from './configurador-ramos';

/** Tabla de descuentos o recargos del ramo. Ninguna tiene iestado: «quitar» = poner el % en 0 (no hay DELETE). */
export interface TablaPorcentaje {
  tabla: 'madisseg' | 'masustac';
  codigo: 'cdisseg' | 'csustanc';
  descripcion: 'xdisseg' | 'xsustanc';
  porcentaje: 'pdisseg' | 'porcenta';
  /** Largo de la descripción (CHAR). */
  largo: number;
  /** Decimales del % (NUMERIC(13,6) / NUMERIC(11,4)). */
  decimales: number;
  nombre: string;
}

export const DISPOSITIVOS: TablaPorcentaje = {
  tabla: 'madisseg', codigo: 'cdisseg', descripcion: 'xdisseg', porcentaje: 'pdisseg', largo: 60, decimales: 6, nombre: 'dispositivo de seguridad',
};
export const SUSTANCIAS: TablaPorcentaje = {
  tabla: 'masustac', codigo: 'csustanc', descripcion: 'xsustanc', porcentaje: 'porcenta', largo: 255, decimales: 4, nombre: 'sustancia peligrosa',
};

export interface CambioPorcentaje {
  codigo?: number | null;
  descripcion?: string | null;
  porcentaje?: number | null;
}

/** Valida alta (descripción y % obligatorios) o edición (al menos un campo). Código SMALLINT 1..32767 si viene. */
export function validarPorcentaje(t: TablaPorcentaje, c: CambioPorcentaje, alta: boolean): string[] {
  const errores: string[] = [];
  if (c.codigo != null && (!Number.isInteger(c.codigo) || c.codigo < 1 || c.codigo > 32767)) {
    errores.push(`${t.codigo} debe ser un entero entre 1 y 32767.`);
  }
  const desc = c.descripcion == null ? null : String(c.descripcion).trim();
  if (alta && !desc) errores.push(`${t.descripcion} es obligatorio.`);
  if (desc != null && desc.length > t.largo) errores.push(`${t.descripcion} admite hasta ${t.largo} caracteres.`);
  if (alta && c.porcentaje == null) errores.push(`${t.porcentaje} es obligatorio.`);
  if (c.porcentaje != null) {
    if (typeof c.porcentaje !== 'number' || !Number.isFinite(c.porcentaje) || c.porcentaje < 0 || c.porcentaje > 100) {
      errores.push(`${t.porcentaje} debe estar entre 0 y 100.`);
    } else if (Math.abs(Math.round(c.porcentaje * 10 ** t.decimales) - c.porcentaje * 10 ** t.decimales) > 1e-6) {
      errores.push(`${t.porcentaje} admite hasta ${t.decimales} decimales.`);
    }
  }
  if (!alta && c.descripcion === undefined && c.porcentaje === undefined) errores.push('No hay nada que cambiar.');
  return errores;
}

/** Nombre corto de la ruta (antiguedad, reparto, rango) o de la tabla (MATARIFA_REPARTO_NEXUS…); null si no es de condominio. */
export function tablaCondominio(param: string): TablaCondominio | null {
  const p = String(param ?? '').trim();
  const corto = p.toLowerCase() as TablaCondominio;
  if (corto in TABLAS_CONDOMINIO) return corto;
  const largo = (Object.keys(TABLAS_CONDOMINIO) as TablaCondominio[]).find((k) => TABLAS_CONDOMINIO[k].toLowerCase() === p.toLowerCase());
  return largo ?? null;
}

/** Avisos del reparto: con filas itipo 'P', los % deben sumar 100. */
export function avisosReparto(filas: Array<{ itipo?: unknown; pvalor?: unknown }>): string[] {
  const p = filas.filter((f) => String(f.itipo ?? '').trim().toUpperCase() === 'P');
  if (!p.length) return [];
  const suma = p.reduce((acc, f) => acc + Number(f.pvalor ?? 0), 0);
  return Math.abs(suma - 100) < 0.0001 ? [] : [`Los porcentajes del reparto (itipo P) suman ${Number(suma.toFixed(6))}, deben sumar 100.`];
}

/** La escritura de MATARIFA_*_NEXUS es del tarificador de condominio (CondominioService), no se duplica aquí. */
export const MENSAJE_CONDOMINIO_ESCRITURA =
  'La escritura de MATARIFA_ANTIGUEDAD/REPARTO/RANGO_NEXUS es del tarificador de condominio (CondominioService: ' +
  'updateTarificadorAntiguedad para antigüedad y reparto, PUT condominio/tarificador/tasa para rango). Esa lógica vive en ' +
  'origin/main y no está en esta rama del configurador; para no duplicarla, el PUT se habilita cuando la rama traiga ese ' +
  'servicio. Mientras tanto usa el tarificador de condominio.';
