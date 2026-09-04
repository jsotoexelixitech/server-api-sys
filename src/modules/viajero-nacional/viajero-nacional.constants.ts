/**
 * Planes fijos ramo 25 (RIESGOS ESPECIALES).
 * No mezclar con viajero internacional ramo 5 (VIAJE4–VIAJ10 de ese ramo).
 */
export type ViajeroRiesgosPlan = {
  cramo: 25;
  xramo: string;
  cplan: string;
  xplan: string;
  cproducto: string;
  ndias: number;
  cmoneda: string;
  xmoneda: string;
  maxDependientes: number;
  ifrecuencia: string;
  xfrecuencia: string;
  cproductor: number;
};

export const VIAJERO_NACIONAL: ViajeroRiesgosPlan = {
  cramo: 25,
  xramo: 'RIESGOS ESPECIALES',
  cplan: 'VIAJE3',
  xplan: 'Plan Viajero Nacional',
  cproducto: '1',
  ndias: 3,
  cmoneda: '$',
  xmoneda: 'DOLARES',
  maxDependientes: 5,
  ifrecuencia: 'E',
  xfrecuencia: 'UNICA',
  cproductor: 0,
};

/** Pantalla Sis2000: VIAJE4 · Plan Viajero Margarita · producto 1. */
export const VIAJERO_MARGARITA: ViajeroRiesgosPlan = {
  cramo: 25,
  xramo: 'RIESGOS ESPECIALES',
  cplan: 'VIAJE4',
  xplan: 'Plan Viajero Margarita',
  cproducto: '1',
  ndias: 4,
  cmoneda: '$',
  xmoneda: 'DOLARES',
  maxDependientes: 5,
  ifrecuencia: 'E',
  xfrecuencia: 'UNICA',
  cproductor: 0,
};
