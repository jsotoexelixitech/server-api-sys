import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { BANDERA_AUTO } from './configurador-auto.service';
import { avisosFilasDias, validarFilasDias, type FilaDias } from './configurador-tarifa-dias';
import { auditoriaSql, escribirSql, exigirBandera, exigirPlanSql, existeSql, lote, rtrim } from './configurador.comun';
import type { TarifaDiasDto } from './dto/configurador-tarifa-dias.dto';

type Fila = Record<string, unknown>;
const numOrNull = (v: unknown) => (v == null ? null : Number(v));
const bit = (v: unknown) => v === true || v === 1 || String(v).trim().toLowerCase() === 'true';

const COLUMNAS = `RTRIM(ccober) AS ccober, RTRIM(ctarifa) AS ctarifa, ctarifabi, qdias, bnacional, RTRIM(cmoneda) AS cmoneda,
  ndias_min, ndias_max, msuma, mprima, mprima_anual, mprima_dia, RTRIM(iestado) AS iestado`;

function filaSalida(f: Fila) {
  return {
    ccober: rtrim(f.ccober), ctarifa: rtrim(f.ctarifa), ctarifabi: Number(f.ctarifabi), qdias: Number(f.qdias), bnacional: bit(f.bnacional),
    cmoneda: f.cmoneda == null ? null : rtrim(f.cmoneda), ndias_min: numOrNull(f.ndias_min), ndias_max: numOrNull(f.ndias_max),
    msuma: numOrNull(f.msuma), mprima: numOrNull(f.mprima), mprima_anual: numOrNull(f.mprima_anual), mprima_dia: numOrNull(f.mprima_dia),
    iestado: f.iestado == null ? null : rtrim(f.iestado),
  };
}

/**
 * Tarifa por días del plan (maplantar_dias; R.C. Binacional en los ramos 18 y 28). La lee sp_calculo_auto_nexus.
 * Escritura con CONFIGURADOR_AUTO_ESCRITURA: reemplaza las filas 'V' de (plan, cobertura, tarifa) en una transacción.
 */
@Injectable()
export class ConfiguradorTarifaDiasService {
  private readonly logger = new Logger(ConfiguradorTarifaDiasService.name);

  constructor(private readonly db: MssqlService) {}

  /** Todas las filas del plan ('V' primero), ordenadas por cobertura, tarifa, ctarifabi, nacional y días. */
  async listar(cramo: number, cplan: string) {
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`SELECT ${COLUMNAS} FROM maplantar_dias WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan
      ORDER BY ccober, ctarifa, CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, ctarifabi, bnacional DESC, ndias_min`);
    return ((r.recordset ?? []) as Fila[]).map(filaSalida);
  }

  /**
   * Reemplaza las filas 'V' de (plan, cobertura, tarifa): las 'V' actuales pasan a 'I' y las enviadas quedan 'V' (si la
   * PK ya existe se reutiliza la fila). La cobertura y la tarifa deben estar en maplantar del plan (el SP las une).
   */
  async reemplazar(cramo: number, cplan: string, ccober: string, ctarifa: string, dto: TarifaDiasDto) {
    exigirBandera(BANDERA_AUTO, 'auto (tarifa por días)');
    const plan = cplan.trim();
    const filas: FilaDias[] = dto.filas ?? [];
    const errores = validarFilasDias(filas, plan);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const base = () => {
      const r = this.db.request();
      r.input('cramo', sql.SmallInt, cramo);
      r.input('cplan', sql.Char(6), plan);
      r.input('ccober', sql.Char(4), ccober.trim());
      r.input('ctarifa', sql.Char(4), ctarifa.trim());
      return r;
    };
    if (!(await existeSql(base(), 'SELECT 1 FROM maplantar WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND ccober = @ccober AND ctarifa = @ctarifa'))) {
      throw new BadRequestException(`La cobertura ${ccober.trim()} con la tarifa ${ctarifa.trim()} no está en maplantar del plan ${plan} (ramo ${cramo}).`);
    }

    const req = base();
    auditoriaSql(req);
    const k = 'cramo = @cramo AND cplan = @cplan AND ccober = @ccober AND ctarifa = @ctarifa';
    const sentencias = [
      `SELECT ${COLUMNAS} FROM maplantar_dias WITH (UPDLOCK, HOLDLOCK) WHERE ${k} AND iestado = 'V' ORDER BY ctarifabi, bnacional DESC, ndias_min;`,
      `UPDATE maplantar_dias SET iestado = 'I', fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1 WHERE ${k} AND iestado = 'V';`,
    ];
    filas.forEach((f, i) => {
      req.input(`tb${i}`, sql.Numeric(18, 0), f.ctarifabi);
      req.input(`qd${i}`, sql.Numeric(18, 0), f.qdias);
      req.input(`bn${i}`, sql.Bit, f.bnacional ? 1 : 0);
      req.input(`mo${i}`, sql.Char(3), f.cmoneda?.trim() || null);
      req.input(`dmin${i}`, sql.Numeric(4, 0), f.ndias_min);
      req.input(`dmax${i}`, sql.Numeric(4, 0), f.ndias_max);
      req.input(`ms${i}`, sql.Numeric(18, 4), f.msuma ?? 0);
      req.input(`mp${i}`, sql.Numeric(18, 4), f.mprima ?? 0);
      req.input(`ma${i}`, sql.Numeric(18, 4), f.mprima_anual ?? 0);
      req.input(`md${i}`, sql.Numeric(18, 4), f.mprima_dia ?? 0);
      const pk = `${k} AND ctarifabi = @tb${i} AND qdias = @qd${i} AND bnacional = @bn${i}`;
      sentencias.push(`IF EXISTS (SELECT 1 FROM maplantar_dias WHERE ${pk})
        UPDATE maplantar_dias SET cmoneda = @mo${i}, ndias_min = @dmin${i}, ndias_max = @dmax${i}, msuma = @ms${i}, mprima = @mp${i},
          mprima_anual = @ma${i}, mprima_dia = @md${i}, iestado = 'V', fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
        WHERE ${pk};
      ELSE
        INSERT INTO maplantar_dias (cramo, cplan, ctarifa, ccober, ctarifabi, qdias, bnacional, u_version, cmoneda, ndias_min, ndias_max,
          msuma, mprima, mprima_anual, mprima_dia, iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
        VALUES (@cramo, @cplan, @ctarifa, @ccober, @tb${i}, @qd${i}, @bn${i}, '!', @mo${i}, @dmin${i}, @dmax${i}, @ms${i}, @mp${i}, @ma${i},
          @md${i}, 'V', @cprog, @ifuente, GETDATE(), @cusuario, 1);`);
    });
    const r = await escribirSql(this.logger, 'reemplazar la tarifa por días', () => req.query(lote(sentencias)));
    const antes = ((r.recordsets as unknown as Fila[][])[0] ?? []).map(filaSalida);
    this.logger.warn(`maplantar_dias ${cramo}/${plan} cob ${ccober.trim()} tar ${ctarifa.trim()}: ${antes.length} → ${filas.length} filas 'V'`);
    return {
      cramo, cplan: plan, ccober: ccober.trim(), ctarifa: ctarifa.trim(), grabado: true, filas: filas.length, antes,
      advertencias: avisosFilasDias(filas, plan),
    };
  }
}
