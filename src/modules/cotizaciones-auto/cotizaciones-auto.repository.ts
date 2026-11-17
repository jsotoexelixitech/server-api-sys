import { Injectable } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import type { CotizacionAutoComplemento } from './cotizaciones-auto.types';

type Row = Record<string, unknown>;

const SP_COTIZACIONES_GET = 'sp_cotizaciones_get';

/**
 * Lo que el API de SysIP no publica, leído en Sis2000 por cproces (solo lectura):
 * - sopoliza: ramo, tomador (ctenedor), productor y si ya se emitió (cpoliza/cnpoliza).
 * - maclient (letra del documento y nombre), maproduc (nombre del productor).
 * - matipos / macategtr: nombres del tipo de vehículo y del uso (ccategotr + ctipo, como spCalculoAuto).
 * - separam grupo RCVA: misma regla que sp_pre_emision_automovil_rcv_nexus usa para rechazar una cotización cuyo
 *   plan emite el RCV en una póliza aparte (ramo + plan + productor; productor vacío = todos).
 */
const SQL_COMPLEMENTO = `
SELECT TOP (1)
  p.cramo,
  CONVERT(VARCHAR(20), p.ctenedor)   AS ctenedor,
  LTRIM(RTRIM(c.cid))                AS cid,
  LTRIM(RTRIM(c.xcliente))           AS xcliente,
  p.cproductor,
  LTRIM(RTRIM(m.xproductor))         AS xproductor,
  p.cpoliza,
  NULLIF(LTRIM(RTRIM(p.cnpoliza)), '') AS cnpoliza,
  t.xtipo,
  u.xuso,
  rv.ramoRcvAparte
FROM sopoliza p WITH (NOLOCK)
LEFT JOIN maclient c WITH (NOLOCK) ON c.cci_rif = p.ctenedor
LEFT JOIN maproduc m WITH (NOLOCK) ON m.cproductor = p.cproductor
OUTER APPLY (
  SELECT TOP (1) LTRIM(RTRIM(xtipo)) AS xtipo
  FROM matipos WITH (NOLOCK)
  WHERE ctipo = @ctipo
) t
OUTER APPLY (
  SELECT TOP (1) LTRIM(RTRIM(xcategoria)) AS xuso
  FROM macategtr WITH (NOLOCK)
  WHERE ccategotr = @uso AND ctipo = @ctipo
  ORDER BY CASE WHEN cramo = p.cramo THEN 0 ELSE 1 END
) u
OUTER APPLY (
  SELECT TOP (1) r.nentero1 AS ramoRcvAparte
  FROM separam r WITH (NOLOCK)
  WHERE r.cgrupparam = 'RCVA' AND r.istatus = 'V' AND r.csiono1 = 'S'
    AND TRY_CONVERT(INT, r.cvdefecto1) = p.cramo AND TRIM(r.cvdefecto2) = TRIM(p.cplan)
    AND (NULLIF(TRIM(r.cvdefecto3), '') IS NULL OR TRY_CONVERT(NUMERIC(18), r.cvdefecto3) = p.cproductor)
  ORDER BY CASE WHEN NULLIF(TRIM(r.cvdefecto3), '') IS NULL THEN 1 ELSE 0 END, r.cparamet
) rv
WHERE p.cproces = @cproces`;

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const textOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

/** Acceso a Sis2000 del flujo de cotizaciones de automóvil (conexión mssql de nest-api). */
@Injectable()
export class CotizacionesAutoRepository {
  constructor(private readonly db: MssqlService) {}

  /**
   * `sp_cotizaciones_get` con los mismos parámetros y tipos que SysIP (cotizaciones.repository.js): `id` = cproces y el
   * resto NULL. Devuelve sus dos recordsets [cotizaciones, coberturas].
   */
  async getCotizacionSp(cproces: string): Promise<{ cotizaciones: Row[]; coberturas: Row[] }> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('id', T.Numeric(20, 0), cproces);
    req.input('productor', T.Numeric(17, 0), null);
    req.input('usuario', T.Numeric(11, 0), null);
    req.input('tomador', T.Numeric(17, 0), null);
    req.input('plan', T.NVarChar(20), null);
    req.input('marca', T.NVarChar(6), null);
    req.input('modelo', T.NVarChar(6), null);
    req.input('version', T.NVarChar(6), null);
    req.input('anio', T.Int, null);
    req.input('emitida', T.Bit, null);
    req.input('desde', T.Date, null);
    req.input('hasta', T.Date, null);
    req.input('page', T.Int, null);
    req.input('pageSize', T.Int, null);
    const result = await req.execute(SP_COTIZACIONES_GET);
    const recordsets = (result.recordsets ?? []) as unknown as Row[][];
    return { cotizaciones: recordsets[0] ?? [], coberturas: recordsets[1] ?? [] };
  }

  /** Complemento de Sis2000 de la cotización; null si no está en sopoliza. */
  async getComplemento(
    cproces: string,
    vehiculo: { tipo: number | null; uso: number | null },
  ): Promise<CotizacionAutoComplemento | null> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('cproces', T.Numeric(20, 0), cproces);
    req.input('ctipo', T.Numeric(4, 0), vehiculo.tipo);
    req.input('uso', T.Numeric(4, 0), vehiculo.uso);
    const { recordset } = await req.query<Row>(SQL_COMPLEMENTO);
    const row = recordset?.[0];
    if (!row) return null;
    return {
      cramo: numberOrNull(row['cramo']),
      ctenedor: textOrNull(row['ctenedor']),
      cid: textOrNull(row['cid']),
      xcliente: textOrNull(row['xcliente']),
      cproductor: numberOrNull(row['cproductor']),
      xproductor: textOrNull(row['xproductor']),
      cpoliza: numberOrNull(row['cpoliza']),
      cnpoliza: textOrNull(row['cnpoliza']),
      xtipo: textOrNull(row['xtipo']),
      xuso: textOrNull(row['xuso']),
      ramoRcvAparte: numberOrNull(row['ramoRcvAparte']),
    };
  }
}

