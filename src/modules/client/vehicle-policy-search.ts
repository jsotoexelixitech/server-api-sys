/**
 * Búsqueda de pólizas de automóvil por vehículo/titular (portal de siniestros, EXE-62).
 *
 * Reglas de seguridad:
 * - Todos los valores del usuario viajan como parámetros; el SQL nunca se arma con ellos.
 * - Exige criterios mínimos para no volcar listados masivos: placa, cédula/RIF, o marca
 *   acompañada del código de productor (cartera del productor).
 * - Si no hay coincidencias devuelve vacío; jamás cae a "todas las pólizas".
 */
export const RAMOS_AUTO = [18, 26] as const; // 18 = Automóvil, 26 = RCV de vehículos
export const LIMIT_DEFAULT = 20;
export const LIMIT_MAX = 50;

export interface VehiclePolicyFilters {
  placa?: string;
  cci_rif?: number;
  marca?: string;
  cproductor?: number;
  limit?: number;
  offset?: number;
}

export type SqlParam =
  | { name: string; type: 'varchar'; length: number; value: string }
  | { name: string; type: 'numeric'; value: number }
  | { name: string; type: 'int'; value: number };

export interface BuiltQuery {
  sql: string;
  params: SqlParam[];
  limit: number;
  offset: number;
}

export function normalizarPlaca(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Escapa comodines de LIKE para que la marca se busque literal. */
export function escaparLike(valor: string): string {
  return valor.replace(/[\\%_[]/g, (c) => `\\${c}`);
}

export function validarCriterios(f: VehiclePolicyFilters): string | null {
  if (f.placa !== undefined) {
    const placa = normalizarPlaca(f.placa);
    if (placa.length < 3 || placa.length > 15) return 'placa inválida (3 a 15 caracteres alfanuméricos).';
  }
  const tienePlaca = !!f.placa;
  const tieneCedula = f.cci_rif !== undefined && f.cci_rif !== null;
  const marcaConProductor = !!f.marca && f.cproductor !== undefined && f.cproductor !== null;
  if (!tienePlaca && !tieneCedula && !marcaConProductor) {
    return 'Indique placa o cci_rif; la marca solo se acepta junto con cproductor.';
  }
  return null;
}

export function buildVehiclePolicyQuery(f: VehiclePolicyFilters): BuiltQuery {
  const error = validarCriterios(f);
  if (error) throw new RangeError(error);

  const limit = Math.min(Math.max(f.limit ?? LIMIT_DEFAULT, 1), LIMIT_MAX);
  const offset = Math.max(f.offset ?? 0, 0);

  const params: SqlParam[] = [];
  const where: string[] = [`p.cramo IN (${RAMOS_AUTO.join(',')})`];

  if (f.placa) {
    where.push('v.xplaca = @placa');
    params.push({ name: 'placa', type: 'varchar', length: 15, value: normalizarPlaca(f.placa) });
  }
  if (f.cci_rif !== undefined && f.cci_rif !== null) {
    where.push('(v.casegurado = @cci_rif OR p.ctenedor = @cci_rif)');
    params.push({ name: 'cci_rif', type: 'numeric', value: f.cci_rif });
  }
  if (f.cproductor !== undefined && f.cproductor !== null) {
    where.push('p.cproductor = @cproductor');
    params.push({ name: 'cproductor', type: 'numeric', value: f.cproductor });
  }
  if (f.marca) {
    where.push("mar.xmarca LIKE @marca ESCAPE '\\'");
    params.push({ name: 'marca', type: 'varchar', length: 60, value: `${escaparLike(f.marca.trim())}%` });
  }

  params.push({ name: 'offset', type: 'int', value: offset });
  // Se pide una fila de más para saber si hay otra página sin un COUNT adicional.
  params.push({ name: 'fetch', type: 'int', value: limit + 1 });

  const sql = `
    SELECT
      CONVERT(varchar(20), p.cpoliza) AS cpoliza, -- numeric(19,0): como texto para no perder precisión en JS
      p.fanopol, p.fmespol,
      RTRIM(p.cnpoliza)  AS cnpoliza,
      p.cramo,
      RTRIM(r.xdescripcion_l) AS xramo,
      RTRIM(p.cplan)     AS cplan,
      RTRIM(p.istatpol)  AS istatpol,
      p.fdesde           AS poliza_desde,
      p.fhasta           AS poliza_hasta,
      p.cproductor,
      p.cmoneda,
      p.ctenedor,
      v.ccerti,
      RTRIM(v.istatcer)  AS istatcer,
      v.fdesde           AS cert_desde,
      v.fhasta           AS cert_hasta,
      RTRIM(v.xplaca)    AS xplaca,
      RTRIM(v.xsercar)   AS xsercar,
      RTRIM(v.xsermot)   AS xsermot,
      RTRIM(v.xcolor)    AS xcolor,
      v.cano, v.cmarca, v.cmodelo, v.cversion,
      v.mvalor, v.qpuestos,
      RTRIM(mar.xmarca)  AS xmarca,
      v.casegurado,
      RTRIM(a.xcliente)  AS xasegurado,
      RTRIM(a.cid)       AS cid_asegurado
    FROM vhcerti v
    INNER JOIN adpoliza p
       ON p.cpoliza = v.cpoliza AND p.fanopol = v.fanopol AND p.fmespol = v.fmespol
    LEFT JOIN maramos r ON r.cramo = p.cramo
    LEFT JOIN maclient a ON a.cci_rif = v.casegurado
    OUTER APPLY (
      SELECT TOP 1 xmarca FROM mamarcas
      WHERE LTRIM(RTRIM(CONVERT(VARCHAR(10), cmarca))) = LTRIM(RTRIM(CONVERT(VARCHAR(10), v.cmarca)))
    ) mar
    WHERE ${where.join('\n      AND ')}
    ORDER BY p.fhasta DESC, p.cpoliza DESC, v.ccerti
    OFFSET @offset ROWS FETCH NEXT @fetch ROWS ONLY`;

  return { sql, params, limit, offset };
}

export interface PlanKey {
  cramo: number;
  cplan: string;
}

/**
 * Coberturas del plan contratado. Se resuelve por plan (cramo + cplan) y no por póliza porque:
 *  - `vhpol_cob` solo tiene filas para pólizas 2024 y parte de 2025 (ninguna de 2026).
 *  - `spGetCoverageClient` recibe cpoliza como numeric(18,0) y el 38 % de las pólizas 2026
 *    tiene 19 dígitos.
 * `msumamax` es el máximo de la tarifa del plan; no es la suma asegurada del vehículo (`mvalor`).
 */
export function buildCoberturasQuery(planes: PlanKey[]): { sql: string; params: SqlParam[] } {
  if (planes.length === 0 || planes.length > LIMIT_MAX) {
    throw new RangeError(`Se esperaban entre 1 y ${LIMIT_MAX} planes`);
  }
  const params: SqlParam[] = [];
  const tuplas = planes.map((k, i) => {
    params.push({ name: `r${i}`, type: 'int', value: k.cramo });
    params.push({ name: `c${i}`, type: 'varchar', length: 10, value: k.cplan });
    return `(pt.cramo = @r${i} AND RTRIM(pt.cplan) = @c${i})`;
  });

  const sql = `
    SELECT
      pt.cramo,
      RTRIM(pt.cplan) AS cplan,
      mc.ccobertura,
      RTRIM(mc.xdescripcion_l) AS xcobertura,
      MAX(pt.msumamax) AS msumamax
    FROM maplantar pt
    INNER JOIN macoberturas mc ON mc.ccobertura = pt.ccober AND mc.cramo = pt.cramo
    WHERE (${tuplas.join('\n        OR ')})
    GROUP BY pt.cramo, RTRIM(pt.cplan), mc.ccobertura, RTRIM(mc.xdescripcion_l)
    ORDER BY pt.cramo, RTRIM(pt.cplan), mc.ccobertura`;

  return { sql, params };
}
