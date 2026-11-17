import { Logger } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { SP_POLIZA_OBSERVACION } from '../../config/sis2000-sp.constants';
import { parseSPError } from './sp-error.helper';

/** Largo de adpoliza.xobserva (VARCHAR(255)). */
export const OBSERVACIONES_MAX = 255;

/**
 * Observaciones de la póliza enviadas en la emisión (personas y RCV).
 * Quita caracteres de control (saltos de línea, tabs, etc. pasan a un espacio), recorta espacios
 * y trunca a 255. Devuelve null si no hay texto (no se llama al SP ni cambia la respuesta).
 */
export function normalizarObservaciones(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const texto = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, OBSERVACIONES_MAX)
    .trim();
  return texto === '' ? null : texto;
}

/**
 * Valida el campo antes de emitir, igual que el DTO de personas (@IsString + @MaxLength(255)):
 * debe ser texto de hasta 255 caracteres. Devuelve el mensaje de error o null si es válido o no vino.
 */
export function validarObservaciones(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return 'observaciones debe ser texto.';
  if (raw.length > OBSERVACIONES_MAX) {
    return `observaciones admite máximo ${OBSERVACIONES_MAX} caracteres.`;
  }
  return null;
}

/**
 * Guarda adpoliza.xobserva con sp_poliza_observacion_nexus tras una emisión exitosa.
 * No bloqueante: si el SP falla (o aún no existe en la base) solo deja un warn y devuelve false.
 * El log no incluye el texto, solo su largo.
 */
export async function guardarObservacionPoliza(
  db: MssqlService,
  logger: Logger,
  cnpoliza: string,
  texto: string,
): Promise<boolean> {
  const poliza = String(cnpoliza ?? '').trim();
  if (!poliza || !texto) return false;
  try {
    const T = db.types;
    const req = db.request();
    req.input('cnpoliza', T.VarChar(30), poliza);
    req.input('xobserva', T.VarChar(OBSERVACIONES_MAX), texto);
    const result = await req.execute(SP_POLIZA_OBSERVACION);
    const filas = Number(result.recordset?.[0]?.['filas_actualizadas'] ?? 0);
    if (filas > 0) {
      logger.log(`observaciones guardadas cnpoliza=${poliza} largo=${texto.length}`);
      return true;
    }
    logger.warn(`observaciones sin filas actualizadas cnpoliza=${poliza} largo=${texto.length}`);
    return false;
  } catch (err) {
    logger.warn(
      `observaciones no guardadas cnpoliza=${poliza} largo=${texto.length}: ${parseSPError(err)}`,
    );
    return false;
  }
}
