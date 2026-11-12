import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { ApiChannelService } from '../auth/api-channel.service';

/** Canal y productor registrados en una póliza emitida (Sis2000). */
export type EmisorPoliza = {
  cnpoliza: string;
  ccanalalt: number | null;
  xcanalalt: string | null;
  cproductor: number | null;
  xproductor: string | null;
  cgestor: string | null;
};

export const MAX_POLIZAS_EMISOR = 100;
const PATRON_POLIZA = /^[A-Za-z0-9._/-]{1,30}$/;

/** «a, b ,a» → ['a','b']; rechaza códigos raros (solo se aceptan números de póliza). */
export function parsePolizas(raw: string | string[] | undefined): string[] {
  const partes = (Array.isArray(raw) ? raw : [raw ?? ''])
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  const unicas = [...new Set(partes)];
  if (!unicas.length) throw new BadRequestException('cnpoliza es requerido.');
  if (unicas.length > MAX_POLIZAS_EMISOR) {
    throw new BadRequestException(`Máximo ${MAX_POLIZAS_EMISOR} pólizas por consulta.`);
  }
  const malas = unicas.filter((p) => !PATRON_POLIZA.test(p));
  if (malas.length) throw new BadRequestException('cnpoliza con formato inválido.');
  return unicas;
}

function numero(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function texto(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

/**
 * Solo lectura (12-nov-2026): el canal alterno y el productor que Sis2000 tiene en la póliza
 * (adpoliza; si vienen vacíos, el primer recibo de adrecibos que los tenga). Lo usa el Monitor
 * de expedientes de Nexus porque magestor trae ccanalalt vacío en los gestores creados por
 * spCreateGestorWeb. Sin datos personales: solo códigos y nombres de canal/productor.
 */
@Injectable()
export class CanalEmisorService {
  constructor(
    private readonly db: MssqlService,
    private readonly channels: ApiChannelService,
  ) {}

  async getEmisorPolizas(apikey: string | undefined, raw: string | string[] | undefined): Promise<EmisorPoliza[]> {
    try {
      await this.channels.assertApiKeyRegistered(apikey ?? '');
    } catch {
      throw new ForbiddenException('Este catálogo requiere una apikey registrada.');
    }
    const polizas = parsePolizas(raw);
    const T = this.db.types;
    const req = this.db.request();
    const params = polizas.map((p, i) => {
      req.input(`p${i}`, T.VarChar(30), p);
      return `@p${i}`;
    });
    const res = await req.query(`
      SELECT RTRIM(p.cnpoliza)             AS cnpoliza,
             LTRIM(RTRIM(p.cgestor))       AS cgestor,
             x.ccanalalt,
             LTRIM(RTRIM(c.xcanalalt))     AS xcanalalt,
             x.cproductor,
             LTRIM(RTRIM(m.xproductor))    AS xproductor
      FROM adpoliza p WITH (NOLOCK)
      OUTER APPLY (
        SELECT TOP 1 NULLIF(r.ccanalalt, 0) AS ccanalalt, NULLIF(r.cproductor, 0) AS cproductor
        FROM adrecibos r WITH (NOLOCK)
        WHERE r.cnpoliza = p.cnpoliza
          AND (NULLIF(r.ccanalalt, 0) IS NOT NULL OR NULLIF(r.cproductor, 0) IS NOT NULL)
      ) rc
      CROSS APPLY (
        SELECT COALESCE(NULLIF(p.ccanalalt, 0), rc.ccanalalt)   AS ccanalalt,
               COALESCE(NULLIF(p.cproductor, 0), rc.cproductor) AS cproductor
      ) x
      LEFT JOIN macanalalt c WITH (NOLOCK) ON c.ccanalalt = x.ccanalalt
      LEFT JOIN maproduc m WITH (NOLOCK) ON m.cproductor = x.cproductor
      WHERE p.cnpoliza IN (${params.join(', ')})
      ORDER BY p.cnpoliza, p.fanopol DESC, p.fmespol DESC
    `);
    // Una fila por póliza: la más reciente (renovaciones).
    const out = new Map<string, EmisorPoliza>();
    for (const row of (res.recordset ?? []) as Record<string, unknown>[]) {
      const cnpoliza = texto(row['cnpoliza']);
      if (!cnpoliza || out.has(cnpoliza)) continue;
      out.set(cnpoliza, {
        cnpoliza,
        ccanalalt: numero(row['ccanalalt']),
        xcanalalt: texto(row['xcanalalt']),
        cproductor: numero(row['cproductor']),
        xproductor: texto(row['xproductor']),
        cgestor: texto(row['cgestor']),
      });
    }
    return [...out.values()];
  }
}
