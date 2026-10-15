/**
 * Estatus de póliza en el reporte RPT_POLIZAS.
 *
 * La tabla `poliza` guarda `estatus_poliza` como TEXTO ('PAGADO', 'PENDIENTE', ...) y
 * sp_rpt_polizas filtra por igualdad exacta (p.estatus_poliza = v_cestatus). El catálogo
 * `estatus` y sp_obtener_estatus, en cambio, devuelven el ID numérico. Por eso el valor que
 * viaja en el filtro debe ser la descripción en mayúsculas, nunca el ID.
 */

/** Espejo de la tabla `estatus` (id → descripción) para normalizar IDs numéricos. */
export const ESTATUS_POLIZA_BY_ID: Readonly<Record<string, string>> = {
  '1': 'NOTIFICADO',
  '2': 'PENDIENTE',
  '3': 'PAGADO',
  '4': 'ANULADO',
  '5': 'RECHAZADO',
};

export type OpcionEstatus = { cvalor: string; xdescripcion: string };

function esVacio(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Valor de filtro de estatus tal como lo compara el SP: descripción en mayúsculas.
 * Convierte IDs numéricos ('3' → 'PAGADO') y deja pasar el texto ya correcto.
 * Devuelve el valor original si viene vacío, para no alterar "sin filtro".
 */
export function normalizeEstatusFiltro<T>(value: T): T | string {
  if (esVacio(value)) return value;
  const text = String(value).trim();
  return ESTATUS_POLIZA_BY_ID[text] ?? text.toUpperCase();
}

/**
 * Opciones del catálogo de estatus listas para el filtro: cvalor y xdescripcion llevan
 * la descripción en mayúsculas (compatible con estatus_poliza). Acepta filas de
 * sp_obtener_estatus ({cestatus: id, xdescripcion}) o de la tabla `estatus`
 * ({id, descripcion}). Sin duplicados, en el orden recibido.
 */
export function mapEstatusCatalogRows(rows: unknown): OpcionEstatus[] {
  if (!Array.isArray(rows)) return [];
  const vistos = new Set<string>();
  const opciones: OpcionEstatus[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const descripcion = r.xdescripcion ?? r.descripcion ?? r.label;
    const id = r.cestatus ?? r.id ?? r.cvalor ?? r.value;

    // Preferir la descripción; si solo hay ID conocido, resolverlo.
    const texto = !esVacio(descripcion)
      ? String(descripcion).trim().toUpperCase()
      : !esVacio(id)
        ? (ESTATUS_POLIZA_BY_ID[String(id).trim()] ?? '')
        : '';
    if (texto === '' || vistos.has(texto)) continue;

    vistos.add(texto);
    opciones.push({ cvalor: texto, xdescripcion: texto });
  }
  return opciones;
}
