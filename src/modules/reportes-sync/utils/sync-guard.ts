/** Solo se evalúa si el reemplazo borra más de N filas (en tablas chicas una variación no es señal). */
export const SYNC_FRENO_MIN_BORRADAS = 100;
/** Fracción mínima de lo borrado que debe volver a insertarse. */
export const SYNC_FRENO_RATIO = 0.5;

/**
 * Freno de seguridad de un reemplazo COMPLETO (sin rango de fechas): si se borró mucho y
 * entró menos de la mitad (p. ej. el origen devolvió casi nada), conviene revertir la
 * transacción y dejar el estado anterior en vez de publicar una tabla casi vacía.
 */
export function debeFrenarReemplazo(args: {
  borradas: number;
  escritas: number;
  reemplazoCompleto: boolean;
  /** true cuando la sincronización no borra (catálogos / modo incremental). */
  sinBorrado: boolean;
}): boolean {
  const { borradas, escritas, reemplazoCompleto, sinBorrado } = args;
  if (sinBorrado || !reemplazoCompleto) return false;
  return borradas > SYNC_FRENO_MIN_BORRADAS && escritas < borradas * SYNC_FRENO_RATIO;
}
