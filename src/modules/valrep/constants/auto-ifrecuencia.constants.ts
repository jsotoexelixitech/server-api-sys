/**
 * Códigos ifrecuencia Sis2000 para RCV auto (maplanes_frec / spBuscaFrecuenciaPlan).
 * Nacional: A S M T C · Binacional: D (vigencia corta), B, etc.
 */
export const AUTO_IFRECUENCIA_VALUES = ['A', 'S', 'M', 'T', 'C', 'D', 'B', 'E'] as const;

export type AutoIfrecuenciaCode = (typeof AUTO_IFRECUENCIA_VALUES)[number];
