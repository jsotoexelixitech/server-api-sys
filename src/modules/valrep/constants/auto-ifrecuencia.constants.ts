/**
 * Códigos ifrecuencia Sis2000 para RCV auto (maplanes_frec / spBuscaFrecuenciaPlan).
 * Nacional: A S M T C · Binacional: D (vigencia corta), B, etc.
 */
export const AUTO_IFRECUENCIA_VALUES = ['A', 'S', 'M', 'T', 'C', 'D', 'B', 'E'] as const;

export type AutoIfrecuenciaCode = (typeof AUTO_IFRECUENCIA_VALUES)[number];

/**
 * Recibos que genera cada frecuencia, igual que spGeneraCoberturasYRecibos_Auto_RCV2.
 * Los códigos que no fraccionan (anual, vigencia corta, binacional) van con una cuota.
 */
export const AUTO_IFRECUENCIA_CUOTAS: Record<AutoIfrecuenciaCode, number> = {
  M: 12,
  T: 4,
  C: 3,
  S: 2,
  A: 1,
  E: 1,
  D: 1,
  B: 1,
};
