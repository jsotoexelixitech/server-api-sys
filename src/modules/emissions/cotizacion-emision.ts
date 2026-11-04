import { BadRequestException } from '@nestjs/common';

/**
 * Emisión RCV/auto desde una cotización del cotizador de SysIP (spSoliAuto → sopoliza.cproces).
 * La validación, el bloqueo y la marca de emitida viven en sp_pre_emision_automovil_rcv_nexus
 * (docs/sql/emision-auto-cotizacion); aquí solo se lee el parámetro y se traducen sus errores.
 */

/** sopoliza.cproces es NUMERIC(13). */
const CPROCES_RE = /^\d{1,13}$/;

/** `cproces` (o `cproces_cotizacion`) del body. null si no viene; 400 si no es un número válido. */
export function parseCprocesCotizacion(b: Record<string, unknown>): number | null {
  const raw = b['cproces'] ?? b['cproces_cotizacion'];
  if (raw == null || String(raw).trim() === '') return null;
  const value = String(raw).trim();
  if (!CPROCES_RE.test(value) || Number(value) <= 0) {
    throw new BadRequestException(
      'cproces debe ser el número de la cotización (hasta 13 dígitos).',
    );
  }
  return Number(value);
}

const COTIZACION_ERROR_CODES = [
  'COTIZACION_NO_EXISTE',
  'COTIZACION_EMITIDA',
  'COTIZACION_NO_COINCIDE',
] as const;

/**
 * Error del SP con prefijo de cotización → 400 con `code`, que es lo que distingue cada caso.
 * null si el mensaje no es de cotización.
 */
export function cotizacionErrorFromMessage(msg: string): BadRequestException | null {
  for (const code of COTIZACION_ERROR_CODES) {
    const at = msg.indexOf(`${code}:`);
    if (at >= 0) {
      const message = msg.slice(at + code.length + 1).trim();
      return new BadRequestException({ success: false, code, message });
    }
  }
  return null;
}
