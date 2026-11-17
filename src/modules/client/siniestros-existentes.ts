import { RAMOS_AUTO, type SqlParam } from './vehicle-policy-search';

/**
 * Estatus de `snsinies.istatsin`, deducidos de los datos (ver docs de git-web-siniestros-backend, integracion-snsinies.md).
 * `R` aparece una sola vez en QA (ramo 25, sin pagos ni rechazo): se trata como reabierto, por eso cuenta como abierto.
 */
export const ESTATUS_SINIESTRO: Record<string, string> = {
  P: 'Pendiente',
  R: 'Reabierto',
  F: 'Finalizado',
  A: 'Anulado',
  Z: 'Rechazado',
};
export const ESTATUS_ABIERTOS = ['P', 'R'] as const;
export const MAX_SINIESTROS_EXISTENTES = 50;

export interface FiltrosSiniestrosExistentes {
  cnpoliza?: string;
  placa?: string;
  /** YYYY-MM-DD */
  focurrencia?: string;
  soloAbiertos?: boolean;
}

export interface SiniestroExistente {
  /** Texto: numeric(19) pierde precisión como número de JS. */
  csinies: string;
  cnsinies: string;
  cnpoliza: string;
  placa: string | null;
  cramo: number;
  ccausa: number | null;
  xcausa: string | null;
  focurrencia: string | null;
  fnotificacion: string | null;
  istatsin: string;
  estatus: string;
  abierto: boolean;
}

/**
 * Siniestros de Automóvil/RCV registrados en `snsinies` para una póliza y/o placa, opcionalmente del mismo día de
 * ocurrencia. La placa no está en `snsinies`: sale del certificado (`vhcerti`) de la póliza, anualidad y certificado del
 * siniestro, así cubre también los declarados desde el Sis2000 de escritorio. Todo va parametrizado.
 */
export function buildSiniestrosExistentesQuery(f: FiltrosSiniestrosExistentes): { sql: string; params: SqlParam[] } {
  if (!f.cnpoliza && !f.placa) throw new RangeError('Indique la póliza o la placa');
  const params: SqlParam[] = [];
  const where: string[] = [`s.cramo IN (${RAMOS_AUTO.join(', ')})`];

  if (f.cnpoliza) {
    params.push({ name: 'cnpoliza', type: 'varchar', length: 30, value: f.cnpoliza.trim() });
    where.push('RTRIM(s.cnpoliza) = @cnpoliza');
  }
  if (f.placa) {
    params.push({ name: 'placa', type: 'varchar', length: 20, value: f.placa.trim().toUpperCase() });
    where.push('RTRIM(vh.xplaca) = @placa');
  }
  if (f.focurrencia) {
    params.push({ name: 'focurrencia', type: 'varchar', length: 10, value: f.focurrencia });
    where.push('CONVERT(date, s.focursin) = CONVERT(date, @focurrencia, 23)');
  }
  if (f.soloAbiertos !== false) {
    where.push(`s.istatsin IN (${ESTATUS_ABIERTOS.map((e) => `'${e}'`).join(', ')})`);
  }

  const sql = `
    SELECT TOP (${MAX_SINIESTROS_EXISTENTES})
           CAST(s.csinies AS varchar(20)) AS csinies,
           RTRIM(s.cnsinies) AS cnsinies,
           RTRIM(s.cnpoliza) AS cnpoliza,
           RTRIM(vh.xplaca) AS placa,
           s.cramo,
           s.ccausa,
           RTRIM(ca.xcausa) AS xcausa,
           CONVERT(varchar(10), s.focursin, 23) AS focurrencia,
           CONVERT(varchar(10), s.fnotifi, 23) AS fnotificacion,
           s.istatsin
    FROM snsinies s WITH (NOLOCK)
    LEFT JOIN vhcerti vh WITH (NOLOCK)
           ON vh.cpoliza = s.cpoliza AND vh.fanopol = s.fanopol AND vh.fmespol = s.fmespol AND vh.ccerti = s.ccerti
    LEFT JOIN macausasin ca WITH (NOLOCK)
           ON ca.ccausa = s.ccausa AND ca.cramo = s.cramo
    WHERE ${where.join('\n      AND ')}
    ORDER BY s.focursin DESC, s.csinies DESC`;
  return { sql, params };
}

export function mapearSiniestrosExistentes(filas: Record<string, unknown>[]): SiniestroExistente[] {
  const texto = (v: unknown) => (v == null ? null : String(v).trim() || null);
  return filas.map((f) => {
    const istatsin = String(f.istatsin ?? '').trim().toUpperCase();
    return {
      csinies: String(f.csinies ?? '').trim(),
      cnsinies: String(f.cnsinies ?? '').trim(),
      cnpoliza: String(f.cnpoliza ?? '').trim(),
      placa: texto(f.placa),
      cramo: Number(f.cramo),
      ccausa: f.ccausa == null ? null : Number(f.ccausa),
      xcausa: texto(f.xcausa),
      focurrencia: texto(f.focurrencia),
      fnotificacion: texto(f.fnotificacion),
      istatsin,
      estatus: ESTATUS_SINIESTRO[istatsin] ?? 'Desconocido',
      abierto: (ESTATUS_ABIERTOS as readonly string[]).includes(istatsin),
    };
  });
}
