/**
 * Contrato fijo del plan Viajero Nacional (pantalla Sis2000).
 * No mezclar con viajero internacional ramo 5 (VIAJE4–VIAJ10).
 */
export const VIAJERO_NACIONAL = {
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
} as const;
