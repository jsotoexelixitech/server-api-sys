/**
 * Frecuencias de pago de Sis2000 (adpoliza.ifrecuencia / adrecibos.ifrecuencia)
 * y la cantidad de cuotas que genera cada una, según spGeneraCoberturasYRecibos_Auto_RCV2.
 */
export const AUTO_IFRECUENCIA_VALUES = ['A', 'S', 'T', 'C', 'M', 'E'] as const;

export type AutoIfrecuencia = (typeof AUTO_IFRECUENCIA_VALUES)[number];

export const AUTO_IFRECUENCIA_CUOTAS: Record<AutoIfrecuencia, number> = {
  A: 1,
  E: 1,
  S: 2,
  C: 3,
  T: 4,
  M: 12,
};
