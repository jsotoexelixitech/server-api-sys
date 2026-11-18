// Piezas compartidas por los services del configurador: auditoría, banderas de escritura, lotes en transacción y
// traducción de errores de Sis2000 a respuestas HTTP.

import { BadRequestException, ConflictException, ForbiddenException, HttpException, type Logger, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql';
import { parseSPError } from '../../common/helpers/sp-error.helper';

/** Usuario Sis2000 de la integración Exelixi (mismo de las emisiones Nexus). */
export const CUSUARIO = 20364172;
/** Marca de auditoría en las filas que crea o modifica el configurador. */
export const CPROG = 'NEXUS-CONFIG';
/** ifuente de las escrituras de la fase 1 (comisiones, auto, deducibles). */
export const IFUENTE_SQL = 'SQL';

/** Tipo SQL de un parámetro (mssql no exporta ISqlType en su namespace). */
export type TipoSql = ReturnType<typeof sql.Char> | ReturnType<typeof sql.Numeric> | ReturnType<typeof sql.SmallInt> | ReturnType<typeof sql.TinyInt>;

export const rtrim = (v: unknown) => String(v ?? '').trim();

/** Un solo lote en transacción: con XACT_ABORT cualquier error (o THROW) revierte todo. */
export const lote = (sentencias: string[]) => `SET XACT_ABORT ON;\nBEGIN TRAN;\n${sentencias.join('\n')}\nCOMMIT TRAN;`;

/** THROW con número propio: 51000 → 409 y 51404 → 404 (ver errorSql). El texto es fijo del código, nunca del usuario. */
export const SQL_CONFLICTO = 51000;
export const SQL_NO_EXISTE = 51404;
export const throwSql = (numero: number, texto: string) => `BEGIN\n  ;THROW ${numero}, N'${texto.replace(/'/g, "''")}', 1;\nEND`;

/** Bandera de entorno encendida (1, true, si, sí). */
export const banderaActiva = (nombre: string) =>
  ['1', 'true', 'si', 'sí'].includes(String(process.env[nombre] ?? '').trim().toLowerCase());

/** 403 si la bandera de escritura del tema está apagada. */
export function exigirBandera(nombre: string, tema: string) {
  if (!banderaActiva(nombre)) {
    throw new ForbiddenException(`La escritura de ${tema} está desactivada en este ambiente (${nombre}=1 para habilitarla).`);
  }
}

/** Auditoría de alta: @cprog, @ifuente ('SQL') y @cusuario. */
export function auditoriaSql(req: sql.Request) {
  req.input('cprog', sql.Char(20), CPROG);
  req.input('ifuente', sql.Char(10), IFUENTE_SQL);
  req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
}

/** 'YYYY-MM-DD' de un DATETIME de mssql (Date en UTC) o de un texto. */
export const fechaTexto = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

export async function escribirSql<R>(logger: Logger, accion: string, fn: () => Promise<R>): Promise<R> {
  try {
    return await fn();
  } catch (err) {
    throw errorSql(logger, accion, err);
  }
}

function numeroError(err: unknown): number | undefined {
  const e = (err ?? {}) as { number?: number; originalError?: { info?: { number?: number } }; precedingErrors?: { number?: number }[] };
  return e.number ?? e.originalError?.info?.number ?? e.precedingErrors?.find((p) => p?.number)?.number;
}

/** HttpException tal cual; THROW 51000 → 409 y 51404 → 404 con su texto; el resto → 400 con el detalle del driver. */
export function errorSql(logger: Logger, accion: string, err: unknown): HttpException {
  if (err instanceof HttpException) return err;
  const msg = parseSPError(err) || detalleErrorSqlVacio(err);
  const n = numeroError(err);
  if (n === SQL_CONFLICTO) return new ConflictException(msg);
  if (n === SQL_NO_EXISTE) return new NotFoundException(msg);
  logger.error(`${accion}: ${msg}`);
  return new BadRequestException(`No se pudo ${accion}: ${msg}`);
}

/**
 * Sis2000 a veces lanza el error del SP con el texto vacío (p. ej. RAISERROR de un mensaje NULL). Se arma lo que
 * traiga el driver: errores previos, número, línea y procedimiento, para no mostrar «No se pudo …:» sin causa.
 */
export function detalleErrorSqlVacio(err: unknown): string {
  const e = (err ?? {}) as {
    number?: number; lineNumber?: number; procName?: string; state?: number;
    precedingErrors?: { message?: string; number?: number }[];
    originalError?: { info?: { message?: string; number?: number; procName?: string; lineNumber?: number } };
  };
  const previos = (e.precedingErrors ?? []).map((p) => (p?.message ?? '').trim()).filter(Boolean);
  if (previos.length) return previos.join(' | ');
  const info = e.originalError?.info;
  if (info?.message?.trim()) return info.message.trim();
  const numero = e.number ?? info?.number;
  const proc = e.procName || info?.procName;
  const linea = e.lineNumber ?? info?.lineNumber;
  const partes = [
    numero != null ? `error SQL ${numero}` : '',
    proc ? `en ${proc}` : '',
    linea != null ? `línea ${linea}` : '',
  ].filter(Boolean);
  return partes.length
    ? `${partes.join(' ')} (Sis2000 no envió el texto del error)`
    : 'Sis2000 devolvió un error sin texto';
}

/** SELECT 1 … con parámetros ya cargados en req. */
export async function existeSql(req: sql.Request, consulta: string): Promise<boolean> {
  const r = await req.query(`SELECT CASE WHEN EXISTS (${consulta}) THEN 1 ELSE 0 END AS e`);
  return r.recordset?.[0]?.e === 1;
}

/** 404 si el plan no está ni en maplanes ni en maplanes_per (solo lectura). */
export async function exigirPlanSql(req: sql.Request, cramo: number, cplan: string) {
  req.input('cramo_p', sql.SmallInt, cramo);
  req.input('cplan_p', sql.Char(6), cplan.trim());
  const existe = await existeSql(req, `
    SELECT 1 FROM maplanes WITH (NOLOCK) WHERE cramo = @cramo_p AND cplan = @cplan_p
    UNION ALL SELECT 1 FROM maplanes_per WITH (NOLOCK) WHERE cramo = @cramo_p AND cplan = @cplan_p`);
  if (!existe) throw new NotFoundException(`No existe el plan ${cplan.trim()} en el ramo ${cramo}.`);
}

/** Versión vigente del plan: MAX(fdesde_plan) con iestado 'V' en la tabla de cabecera. */
export const SQL_VERSION_VIGENTE = (tabla: 'maplanes' | 'maplanes_per') =>
  `(SELECT MAX(fdesde_plan) FROM ${tabla} WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V')`;
