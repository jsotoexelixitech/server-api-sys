/**
 * Tipos de cédula/RIF que corresponden a persona jurídica.
 * Mismo criterio que sp_pre_emision_automovil_rcv_nexus (J, G, C).
 */
export const TIPOS_CEDULA_JURIDICA = ['J', 'G', 'C'] as const;

export function esTipoCedulaJuridica(tipo: unknown): boolean {
  if (tipo == null) return false;
  const t = String(tipo).trim().charAt(0).toUpperCase();
  return (TIPOS_CEDULA_JURIDICA as readonly string[]).includes(t);
}
