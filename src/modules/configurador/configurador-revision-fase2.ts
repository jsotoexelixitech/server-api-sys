// Reglas de revisión de la fase 2 (función pura): edades por parentesco en personas, % de descuentos y recargos en
// patrimonial, ramo sin numeración (insramo) y fianzas sin emisión. revisarPlan las agrega a sus ítems.

import { AVISO_FIANZAS, AVISO_SIN_INSRAMO, type FamiliaRamo } from './configurador.familia';
import type { ItemRevision } from './configurador.revision';

export interface PorcentajeRamo {
  tabla: 'madisseg' | 'masustac';
  codigo: number;
  descripcion: string;
  porcentaje: number | null;
}

export interface DatosRevisionFase2 {
  /** El ramo tiene fila en insramo. */
  tieneInsramo: boolean;
  /** Plan de personas (maplanes_per): parentescos de mapltarifas_per y de mapledades_per de la versión vigente. */
  edades?: { parentescosTarifa: number[]; parentescosEdades: number[] };
  /** Patrimonial: dispositivos de seguridad (madisseg) y sustancias (masustac) del ramo. */
  porcentajes?: PorcentajeRamo[];
}

/** % fuera de 0..100 (null no cuenta: los SP lo toman como 0). */
export const porcentajeFueraDeRango = (p: number | null) => p != null && (!Number.isFinite(p) || p < 0 || p > 100);

export function revisarFase2(familia: FamiliaRamo, d: DatosRevisionFase2): ItemRevision[] {
  const items: ItemRevision[] = [];
  const add = (codigo: string, nivel: ItemRevision['nivel'], mensaje: string, seccion: string) => items.push({ codigo, nivel, mensaje, seccion });

  if (familia === 'fianzas') add('FIANZAS_SIN_EMISION', 'aviso', AVISO_FIANZAS, 'plan');

  if (d.edades) {
    const conEdad = new Set(d.edades.parentescosEdades);
    const faltan = [...new Set(d.edades.parentescosTarifa)].filter((p) => !conEdad.has(p)).sort((a, b) => a - b);
    if (faltan.length) {
      add('EDADES_FALTAN', 'error',
        `Parentescos con tarifa y sin edades en mapledades_per: ${faltan.join(', ')} (la emisión no puede validar la edad).`, 'edades-parentesco');
    } else if (d.edades.parentescosTarifa.length) {
      add('EDADES_OK', 'ok', 'Cada parentesco de las tarifas tiene su fila de edades.', 'edades-parentesco');
    }
  }

  if (d.porcentajes) {
    const malos = d.porcentajes.filter((p) => porcentajeFueraDeRango(p.porcentaje));
    for (const p of malos) {
      const que = p.tabla === 'madisseg' ? 'El dispositivo de seguridad' : 'La sustancia';
      add('DESCUENTO_RECARGO_RANGO', 'error',
        `${que} ${p.codigo} (${p.descripcion}) tiene ${p.porcentaje} %: debe estar entre 0 y 100 (${p.tabla}).`, 'descuentos-recargos');
    }
    if (!malos.length && d.porcentajes.length) {
      add('DESCUENTOS_RECARGOS_OK', 'ok', 'Los % de dispositivos y sustancias están entre 0 y 100.', 'descuentos-recargos');
    }
  }

  if (!d.tieneInsramo) add('RAMO_SIN_INSRAMO', 'aviso', AVISO_SIN_INSRAMO, 'plan');
  return items;
}
