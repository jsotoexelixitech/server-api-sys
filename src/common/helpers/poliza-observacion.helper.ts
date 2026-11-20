import { Logger } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { SP_POLIZA_OBSERVACION } from '../../config/sis2000-sp.constants';
import { parseSPError } from './sp-error.helper';
import { getCurrentNestAuth } from '../../modules/auth/nest-request-auth.context';

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

/** Datos de auditoría (auoperaciones, proceso "Observaciones Poliza") que acompañan a la observación. */
export interface ObservacionAuditoria {
  /** De dónde viene: emision_rcv, emision_personas… */
  origen: string;
  /** Usuario Sis2000 si el canal lo envía (SSO). Se ignora si no es un INT válido. */
  cusuario?: unknown;
}

const INT_MAX = 2_147_483_647;

/** cusuario para auoperaciones.cusuario (INT): entero positivo dentro de rango, o null. */
export function cusuarioAuditoria(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= INT_MAX ? n : null;
}

/** SQL Server 8144: "has too many arguments specified" (la SP de la base aún no tiene los parámetros nuevos). */
function esSpSinParametrosNuevos(err: unknown): boolean {
  const e = err as { number?: number; originalError?: { info?: { number?: number } }; message?: string };
  return (
    e?.number === 8144 ||
    e?.originalError?.info?.number === 8144 ||
    /too many arguments specified/i.test(String(e?.message ?? ''))
  );
}

/**
 * Guarda adpoliza.xobserva con sp_poliza_observacion_nexus tras una emisión exitosa y deja la auditoría en
 * auoperaciones (la escribe la SP en la misma transacción: canal y apiKeyId salen del request actual).
 * No bloqueante: si el SP falla (o aún no existe en la base) solo deja un warn y devuelve false.
 * Si la SP de la base es la versión sin auditoría (8144), guarda igual con la llamada vieja y lo avisa.
 * El log no incluye el texto, solo su largo.
 */
export async function guardarObservacionPoliza(
  db: MssqlService,
  logger: Logger,
  cnpoliza: string,
  texto: string,
  auditoria?: ObservacionAuditoria,
): Promise<boolean> {
  const poliza = String(cnpoliza ?? '').trim();
  if (!poliza || !texto) return false;
  const T = db.types;
  const ejecutar = (conAuditoria: boolean) => {
    const req = db.request();
    req.input('cnpoliza', T.VarChar(30), poliza);
    req.input('xobserva', T.VarChar(OBSERVACIONES_MAX), texto);
    if (conAuditoria) {
      const auth = getCurrentNestAuth();
      req.input('cusuario', T.Int, cusuarioAuditoria(auditoria?.cusuario));
      req.input('ifuente', T.VarChar(30), 'NEXUS_API');
      req.input('xorigen', T.VarChar(30), auditoria?.origen?.slice(0, 30) ?? null);
      req.input('xcanal', T.VarChar(50), auth?.xcanalVenta ? String(auth.xcanalVenta).slice(0, 50) : null);
      req.input('xapikey_id', T.VarChar(50), auth?.apiKeyId ? String(auth.apiKeyId).slice(0, 50) : null);
    }
    return req.execute(SP_POLIZA_OBSERVACION);
  };
  try {
    let result;
    try {
      result = await ejecutar(true);
    } catch (err) {
      if (!esSpSinParametrosNuevos(err)) throw err;
      logger.warn(
        `observaciones sin auditoría cnpoliza=${poliza}: ${SP_POLIZA_OBSERVACION} sin parámetros de auditoría en la base (aplicar docs/sql/observaciones-poliza)`,
      );
      result = await ejecutar(false);
    }
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
