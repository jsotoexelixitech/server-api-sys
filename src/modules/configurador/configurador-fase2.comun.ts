// Piezas comunes de la fase 2 del configurador («editar todo»): banderas de escritura y cabecera del plan.

import { NotFoundException } from '@nestjs/common';
import * as sql from 'mssql';
import { rtrim } from './configurador.comun';

/** Frecuencias del plan (maplanes_frec) y del productor (maplanes_frec_produc). Apagada por defecto. */
export const BANDERA_FRECUENCIAS = 'CONFIGURADOR_FRECUENCIAS_ESCRITURA';
/** Quién vende el plan (mausuplan). Apagada por defecto. */
export const BANDERA_QUIEN_VENDE = 'CONFIGURADOR_QUIEN_VENDE_ESCRITURA';
/** Productos (maproductos): la misma bandera que ya usaba el alta con sp_CrearProducto. */
export const BANDERA_PRODUCTOS = 'CONFIGURADOR_PRODUCTOS_ESCRITURA';
/** Cabecera, coberturas y edades por parentesco del plan. Apagada por defecto. */
export const BANDERA_PLANES = 'CONFIGURADOR_PLANES_ESCRITURA';

/** Tabla de cabecera del plan: maplanes (patrimonial y auto; también fianzas) o maplanes_per (personas, y planes VIAJE del ramo 25). Se decide por dónde está el plan, no por la familia. */
export type TablaPlan = 'maplanes' | 'maplanes_per';

/** Cabecera del plan en su versión más reciente (la 'V' primero). */
export interface CabeceraPlan {
  tabla: TablaPlan;
  fdesde_plan: string;
  fhasta_plan: string | null;
  xplan: string;
  cproducto: string;
  cmoneda: string;
  iestado: string;
  ctipo: number | null;
  bnacional: boolean | null;
  /** El plan está también en la otra tabla de cabecera (raro; se avisa). */
  enAmbas: boolean;
}

/**
 * Cabecera del plan: busca en maplanes y en maplanes_per; si está en las dos, manda `preferir` (la familia del ramo).
 * 404 si no está en ninguna. fdesde_plan sale como 'YYYY-MM-DD HH:mm:ss.fff' (estilo 121) para usarla de llave.
 */
export async function cabeceraPlan(req: () => sql.Request, cramo: number, cplan: string, preferir?: TablaPlan): Promise<CabeceraPlan> {
  const leer = async (tabla: TablaPlan) => {
    const r = req();
    r.input('cramo', sql.SmallInt, cramo);
    r.input('cplan', sql.Char(6), cplan.trim());
    const extra = tabla === 'maplanes' ? 'ctipo, bnacional' : 'NULL AS ctipo, NULL AS bnacional';
    const q = await r.query(`SELECT TOP 1 CONVERT(varchar(23), fdesde_plan, 121) AS fdesde_plan, CONVERT(varchar(10), fhasta_plan, 23) AS fhasta_plan,
        RTRIM(xplan) AS xplan, RTRIM(cproducto) AS cproducto, RTRIM(cmoneda) AS cmoneda, RTRIM(iestado) AS iestado, ${extra}
      FROM ${tabla} WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan
      ORDER BY CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, fdesde_plan DESC`);
    return q.recordset?.[0] as Record<string, unknown> | undefined;
  };
  const [cosas, personas] = await Promise.all([leer('maplanes'), leer('maplanes_per')]);
  if (!cosas && !personas) throw new NotFoundException(`No existe el plan ${cplan.trim()} en el ramo ${cramo}.`);
  const tabla: TablaPlan = cosas && personas ? (preferir ?? 'maplanes') : cosas ? 'maplanes' : 'maplanes_per';
  const f = (tabla === 'maplanes' ? cosas : personas) as Record<string, unknown>;
  return {
    tabla,
    fdesde_plan: rtrim(f.fdesde_plan),
    fhasta_plan: f.fhasta_plan == null ? null : rtrim(f.fhasta_plan),
    xplan: rtrim(f.xplan),
    cproducto: rtrim(f.cproducto),
    cmoneda: rtrim(f.cmoneda),
    iestado: rtrim(f.iestado),
    ctipo: f.ctipo == null ? null : Number(f.ctipo),
    bnacional: f.bnacional == null ? null : f.bnacional === true || Number(f.bnacional) === 1,
    enAmbas: Boolean(cosas && personas),
  };
}

/** Fila cruda de mssql con textos recortados y fechas a 'YYYY-MM-DD HH:mm:ss' (para respaldos). */
export function filaPlana(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v instanceof Date) out[k] = Number.isNaN(v.getTime()) ? null : v.toISOString().replace('T', ' ').slice(0, 19);
    else if (typeof v === 'string') out[k] = v.trim();
    else out[k] = v;
  }
  return out;
}
