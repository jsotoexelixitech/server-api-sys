import { Injectable, Logger } from '@nestjs/common';
import { MssqlService } from '../../../database/mssql.service';

export interface ExcludedPlansQuery {
  /** Código producto Sis2000 (RCV auto → '24'). */
  cproducto: string;
  /** Entidad del usuario/gestor logueado (P, C, G, …). */
  centidad: string;
  /** Código gestor/sub-ítem (mausuplan.citem). */
  citem: string;
}

/** Producto Sis2000 asociado al ramo RCV nacional (cramo 18). */
export const RCV_AUTO_CPRODUCTO = '24';

@Injectable()
export class MausuplanRepository {
  private readonly logger = new Logger(MausuplanRepository.name);

  constructor(private readonly db: MssqlService) {}

  /**
   * Centidades a probar en mausuplan para un csubitem.
   * Gestor compuesto (348-342) se guarda con centidad G en Sis2000, no P.
   */
  private resolveCentidadCandidates(citem: string, centidad?: string): string[] {
    const item = citem.trim();
    const hinted = centidad?.trim().toUpperCase() ?? '';
    const out: string[] = [];

    if (item.includes('-') && !item.includes('@')) {
      out.push('G');
    }
    if (hinted && !out.includes(hinted)) {
      out.push(hinted);
    }
    for (const fallback of ['P', 'C']) {
      if (!out.includes(fallback)) out.push(fallback);
    }
    return out;
  }

  /**
   * Planes marcados en mausuplan con itipouso='E' (excluir) para el gestor indicado.
   * Paridad Nexus Product.getFilteredProducts — consulta parametrizada.
   */
  async getExcludedPlans(query: ExcludedPlansQuery): Promise<string[]> {
    const cproducto = query.cproducto.trim();
    const citem = query.citem.trim();

    if (!cproducto || !citem) {
      return [];
    }

    const centidades = this.resolveCentidadCandidates(citem, query.centidad);
    const merged = new Set<string>();

    for (const centidad of centidades) {
      const codes = await this.queryExcludedPlans({
        cproducto,
        centidad,
        citem,
      });
      for (const code of codes) merged.add(code);
      if (merged.size > 0) break;
    }

    const result = [...merged];
    this.logger.log(
      `getExcludedPlans centidad=${centidades.join('|')} citem=${citem} cproducto=${cproducto} → ${result.length} plan(es) excluidos`,
    );
    return result;
  }

  private async queryExcludedPlans(query: ExcludedPlansQuery): Promise<string[]> {
    const cproducto = query.cproducto.trim();
    const centidad = query.centidad.trim().toUpperCase();
    const citem = query.citem.trim();

    if (!cproducto || !centidad || !citem) {
      return [];
    }

    const req = this.db.request();
    const T = this.db.types;
    req.input('citem', T.NVarChar(50), citem);
    req.input('centidad', T.NVarChar(6), centidad);
    req.input('cproducto', T.NVarChar(10), cproducto);

    const sql =
      cproducto === RCV_AUTO_CPRODUCTO
        ? `
        SELECT DISTINCT TRIM(m.cplan) AS cplan
        FROM mausuplan m WITH (NOLOCK)
        INNER JOIN maplanes pl WITH (NOLOCK)
          ON m.cplan = pl.cplan AND m.cramo = pl.cramo
        WHERE m.citem = @citem
          AND m.centidad = @centidad
          AND m.itipouso = 'E'
          AND pl.cramo = 18
          AND pl.iestado = 'V'
        `
        : `
        SELECT DISTINCT TRIM(cplan) AS cplan
        FROM (
          SELECT m.cplan
          FROM mausuplan m WITH (NOLOCK)
          INNER JOIN maplanes_per mp WITH (NOLOCK)
            ON m.cplan = mp.cplan AND m.cramo = mp.cramo
          WHERE m.citem = @citem
            AND m.centidad = @centidad
            AND m.itipouso = 'E'
            AND mp.cproducto = @cproducto
            AND mp.iestado = 'V'
          UNION ALL
          SELECT m.cplan
          FROM mausuplan m WITH (NOLOCK)
          INNER JOIN maplanes pl WITH (NOLOCK)
            ON m.cplan = pl.cplan AND m.cramo = pl.cramo
          WHERE m.citem = @citem
            AND m.centidad = @centidad
            AND m.itipouso = 'E'
            AND pl.cproducto = @cproducto
            AND pl.iestado = 'V'
        ) sub
        `;

    try {
      const result = await req.query<{ cplan: string }>(sql);
      return (result.recordset ?? [])
        .map((row) => String(row.cplan ?? '').trim())
        .filter(Boolean);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getExcludedPlans centidad=${centidad}: ${msg}`);
      throw err;
    }
  }
}
