import { LIMIT_MAX, RAMOS_AUTO, type SqlParam } from './vehicle-policy-search';

export interface CausaSiniestro {
  ccausa: number;
  xcausa: string;
  /** Coberturas (de las consultadas) a las que aplica esta causa. */
  ccoberturas: number[];
}

/**
 * Causas de siniestro que cubren las coberturas contratadas (`macauscob` + `macausasin`). Es la misma relación que usa
 * `sp_genera_siniestro_nexus` para cargar la reserva, así que una causa de esta lista siempre tiene dónde reservarse.
 * `macauscob.ccobertura` es CHAR con relleno ("10  "): se normaliza con TRY_CONVERT.
 */
export function buildCausasQuery(cramo: number, ccoberturas: number[]): { sql: string; params: SqlParam[] } {
  if (!(RAMOS_AUTO as readonly number[]).includes(cramo)) throw new RangeError('Ramo no admitido');
  if (ccoberturas.length === 0 || ccoberturas.length > LIMIT_MAX) {
    throw new RangeError(`Se esperaban entre 1 y ${LIMIT_MAX} coberturas`);
  }
  const params: SqlParam[] = [{ name: 'cramo', type: 'int', value: cramo }];
  const marcadores = ccoberturas.map((c, i) => {
    params.push({ name: `c${i}`, type: 'int', value: c });
    return `@c${i}`;
  });
  const sql = `
    SELECT ca.ccausa, RTRIM(ca.xcausa) AS xcausa, TRY_CONVERT(int, cs.ccobertura) AS ccobertura
    FROM macauscob cs
    INNER JOIN macausasin ca ON ca.ccausa = cs.ccausa AND ca.cramo = cs.cramo
    WHERE cs.cramo = @cramo
      AND TRY_CONVERT(int, cs.ccobertura) IN (${marcadores.join(', ')})
    ORDER BY ca.ccausa, TRY_CONVERT(int, cs.ccobertura)`;
  return { sql, params };
}

/** Agrupa las filas (causa, cobertura) en causas únicas con sus coberturas. */
export function agruparCausas(filas: { ccausa: number; xcausa: string; ccobertura: number | null }[]): CausaSiniestro[] {
  const mapa = new Map<number, CausaSiniestro>();
  for (const f of filas) {
    const c = mapa.get(f.ccausa) ?? { ccausa: f.ccausa, xcausa: String(f.xcausa ?? '').trim(), ccoberturas: [] };
    if (f.ccobertura != null && !c.ccoberturas.includes(f.ccobertura)) c.ccoberturas.push(f.ccobertura);
    mapa.set(f.ccausa, c);
  }
  return [...mapa.values()];
}
