// Lectura de maramos con los indicadores de la clasificación (familia, colectivo, estado, emisión Nexus, conteos y
// secciones). Solo lectura; las reglas viven en configurador.familia.ts.

import * as sql from 'mssql';
import type { MssqlService } from '../../database/mssql.service';
import { rtrim } from './configurador.comun';
import { clasificarRamo, seccionesDeFamilia, type RamoClasificado } from './configurador.familia';

/** Tablas de condominio (tarificador de Técnica) que se escriben fuera de Sis2000 estándar; pueden no existir. */
export const TABLAS_CONDOMINIO = {
  antiguedad: 'MATARIFA_ANTIGUEDAD_NEXUS',
  reparto: 'MATARIFA_REPARTO_NEXUS',
  rango: 'MATARIFA_RANGO_NEXUS',
} as const;
export type TablaCondominio = keyof typeof TABLAS_CONDOMINIO;

/** maramos con los indicadores por ramo. Termina sin WHERE/ORDER. */
const SQL_RAMOS = `
  SELECT r.cramo, LTRIM(RTRIM(r.xdescripcion_l)) AS xdescripcion, r.ctiporamo, r.iplanpers, RTRIM(r.iestado) AS iestado,
    CASE WHEN EXISTS (SELECT 1 FROM matipos t WITH (NOLOCK) WHERE t.cramo = r.cramo)
           OR EXISTS (SELECT 1 FROM macattip a WITH (NOLOCK) WHERE a.cramo = r.cramo) THEN 1 ELSE 0 END AS tiene_auto,
    CASE WHEN EXISTS (SELECT 1 FROM maplanes_per p WITH (NOLOCK) WHERE p.cramo = r.cramo) THEN 1 ELSE 0 END AS tiene_personas,
    (SELECT COUNT(*) FROM macoberturas c WITH (NOLOCK) WHERE c.cramo = r.cramo) AS qcob,
    (SELECT COUNT(*) FROM macoberturas c WITH (NOLOCK) WHERE c.cramo = r.cramo
       AND EXISTS (SELECT 1 FROM macoberturas e WITH (NOLOCK)
                   WHERE e.cramo = 18 AND e.cramoint = c.cramoint AND e.ccoberturaint = c.ccoberturaint)) AS qcob18,
    (SELECT COUNT(*) FROM (SELECT cplan FROM maplanes WITH (NOLOCK) WHERE cramo = r.cramo AND iestado = 'V'
                           UNION SELECT cplan FROM maplanes_per WITH (NOLOCK) WHERE cramo = r.cramo AND iestado = 'V') pv) AS qplanes,
    (SELECT COUNT(DISTINCT cproducto) FROM maproductos WITH (NOLOCK) WHERE cramo = r.cramo) AS qproductos,
    CASE WHEN EXISTS (SELECT 1 FROM insramo i WITH (NOLOCK) WHERE i.cramo = r.cramo) THEN 1 ELSE 0 END AS tiene_insramo,
    CASE WHEN EXISTS (SELECT 1 FROM maplantar_dias d WITH (NOLOCK) WHERE d.cramo = r.cramo) THEN 1 ELSE 0 END AS tiene_dias
  FROM maramos r WITH (NOLOCK)`;

type Fila = Record<string, unknown>;

export interface RamoConSecciones extends RamoClasificado {
  /** El ramo tiene filas en MATARIFA_*_NEXUS. */
  condominio: boolean;
  /** El ramo tiene filas en maplantar_dias. */
  tarifaDias: boolean;
  secciones: string[];
}

function ramoDeFila(f: Fila, conCondominio: Set<number>): RamoConSecciones {
  const cramo = Number(f.cramo);
  const ramo = clasificarRamo({
    cramo,
    xdescripcion: rtrim(f.xdescripcion),
    ctiporamo: f.ctiporamo == null ? null : Number(f.ctiporamo),
    iplanpers: f.iplanpers,
    iestado: f.iestado == null ? null : rtrim(f.iestado),
    tieneTiposAuto: Number(f.tiene_auto) === 1,
    tienePlanesPersonas: Number(f.tiene_personas) === 1,
    coberturas: Number(f.qcob ?? 0),
    coberturasHacia18: Number(f.qcob18 ?? 0),
    planesVigentes: Number(f.qplanes ?? 0),
    productos: Number(f.qproductos ?? 0),
    tieneInsramo: Number(f.tiene_insramo) === 1,
  });
  const condominio = conCondominio.has(cramo);
  const tarifaDias = Number(f.tiene_dias) === 1;
  return { ...ramo, condominio, tarifaDias, secciones: seccionesDeFamilia(ramo.familia, { condominio, tarifaDias }) };
}

/** Tablas MATARIFA_*_NEXUS que existen en esta base (en otras puede faltar alguna). */
export async function tablasCondominioExistentes(db: MssqlService): Promise<string[]> {
  const nombres = Object.values(TABLAS_CONDOMINIO);
  const r = await db.request().query(`SELECT ${nombres.map((t, i) => `OBJECT_ID('dbo.${t}', 'U') AS t${i}`).join(', ')}`);
  const fila = (r.recordset?.[0] ?? {}) as Fila;
  return nombres.filter((_, i) => fila[`t${i}`] != null);
}

/** Ramos con filas en alguna tabla MATARIFA_*_NEXUS (solo las que existen; nombres fijos del código). */
async function ramosConCondominio(db: MssqlService, cramo?: number): Promise<Set<number>> {
  const tablas = await tablasCondominioExistentes(db);
  if (!tablas.length) return new Set();
  const req = db.request();
  if (cramo != null) req.input('cramo', sql.SmallInt, cramo);
  const filtro = cramo != null ? ' WHERE cramo = @cramo' : '';
  const r = await req.query(tablas.map((t) => `SELECT DISTINCT cramo FROM dbo.${t} WITH (NOLOCK)${filtro}`).join(' UNION '));
  return new Set(((r.recordset ?? []) as Fila[]).map((f) => Number(f.cramo)));
}

/** Todos los ramos clasificados, con conteos y secciones (catálogo del builder). */
export async function leerRamos(db: MssqlService): Promise<RamoConSecciones[]> {
  const [r, condominio] = await Promise.all([db.request().query(`${SQL_RAMOS} ORDER BY r.cramo`), ramosConCondominio(db)]);
  return ((r.recordset ?? []) as Fila[]).map((f) => ramoDeFila(f, condominio));
}

/** Un ramo clasificado; null si no existe. */
export async function leerRamo(db: MssqlService, cramo: number): Promise<RamoConSecciones | null> {
  const req = db.request();
  req.input('cramo', sql.SmallInt, cramo);
  const [r, condominio] = await Promise.all([req.query(`${SQL_RAMOS} WHERE r.cramo = @cramo`), ramosConCondominio(db, cramo)]);
  const f = r.recordset?.[0] as Fila | undefined;
  return f ? ramoDeFila(f, condominio) : null;
}
