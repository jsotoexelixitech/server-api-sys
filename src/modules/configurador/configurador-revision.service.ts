import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { equivalenteRamo18 } from './configurador.auto';
import { rtrim } from './configurador.comun';
import { revisarPlan, type DatosRevision, type RevisionPlan } from './configurador.revision';
import type { DatosRevisionFase2 } from './configurador-revision-fase2';
import { ConfiguradorService } from './configurador.service';

type Fila = Record<string, unknown>;
const numOrNull = (v: unknown) => (v == null ? null : Number(v));

/**
 * Revisión «¿se puede emitir?» de un plan (solo lectura, todas las familias). Junta los datos de Sis2000 con
 * consultas NOLOCK y arma los ítems con revisarPlan (regla pura).
 */
@Injectable()
export class ConfiguradorRevisionService {
  constructor(
    private readonly db: MssqlService,
    private readonly configurador: ConfiguradorService,
  ) {}

  async revisar(cramo: number, cplan: string): Promise<RevisionPlan> {
    const { familia } = await this.configurador.familiaDeRamo(cramo);
    const cab = await this.tablaDelPlan(cramo, cplan, familia === 'personas' ? 'maplanes_per' : 'maplanes');
    const personas = cab === 'maplanes_per';
    // Coberturas de la versión vigente del plan (la 'V' más reciente; si no hay 'V', la más reciente).
    const coberturas = personas
      ? `SELECT DISTINCT ccobertura AS ccober, ctarifa FROM mapltarifas_per WITH (NOLOCK)
         WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig`
      : `SELECT DISTINCT ccober, ctarifa FROM maplantar WITH (NOLOCK)
         WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig`;

    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    req.input('cplanv', sql.VarChar(25), cplan.trim());
    const r = await req.query(`
      DECLARE @vig DATETIME = ISNULL(
        (SELECT MAX(fdesde_plan) FROM ${cab} WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V'),
        (SELECT MAX(fdesde_plan) FROM ${cab} WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan));
      SELECT 'maplanes' AS tabla, RTRIM(iestado) AS iestado, RTRIM(cproducto) AS cproducto FROM maplanes WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan
      UNION ALL
      SELECT 'maplanes_per', RTRIM(iestado), RTRIM(cproducto) FROM maplanes_per WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan;
      SELECT cramo FROM maplanes WITH (NOLOCK) WHERE cplan = @cplan AND cramo <> @cramo
      UNION SELECT cramo FROM maplanes_per WITH (NOLOCK) WHERE cplan = @cplan AND cramo <> @cramo;
      WITH cob AS (${coberturas})
      SELECT RTRIM(c.ccober) AS ccobertura, RTRIM(c.ctarifa) AS ctarifa,
        CASE WHEN EXISTS (SELECT 1 FROM matarifa t WITH (NOLOCK) WHERE t.cramo = @cramo AND t.ccober = c.ccober AND t.ctarifa = c.ctarifa)
             THEN 1 ELSE 0 END AS tarifa_existe,
        (SELECT COUNT(*) FROM matarifa_d d WITH (NOLOCK)
          WHERE d.cramo = @cramo AND d.ccober = c.ccober AND d.ctarifa = c.ctarifa AND d.iestado = 'V') AS detalles_v,
        m.ccontrea, m.cramorea, m.ccoberturaint
      FROM cob c
      OUTER APPLY (SELECT TOP 1 ccontrea, cramorea, ccoberturaint FROM macoberturas WITH (NOLOCK) WHERE cramo = @cramo AND ccobertura = c.ccober) m
      ORDER BY TRY_CAST(RTRIM(c.ccober) AS INT), c.ccober;
      SELECT RTRIM(cplan) AS cplan, ctipoprod, cproductor, RTRIM(ccober) AS ccober, RTRIM(ctarifa) AS ctarifa, RTRIM(iestado) AS iestado
      FROM maarancel WITH (NOLOCK) WHERE cramo = @cramo AND iestado = 'V';
      SELECT RTRIM(ifrecuencia) AS ifrecuencia FROM maplanes_frec WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V';
      SELECT COUNT(*) AS n FROM mausuplan WITH (NOLOCK) WHERE cramo = @cramo AND RTRIM(cplan) = @cplanv AND itipouso = 'A';
      SELECT RTRIM(ccobertura) AS ccobertura, ccoberturaint FROM macoberturas WITH (NOLOCK) WHERE cramo = 18;
      SELECT COUNT(*) AS n FROM (SELECT DISTINCT ctipo, ccategotr FROM macattip WITH (NOLOCK) WHERE cramo = @cramo) p;
      SELECT a.ctipo, a.ccategotr, b.cramo
      FROM (SELECT DISTINCT ctipo, ccategotr FROM macattip WITH (NOLOCK) WHERE cramo = @cramo) a
      JOIN (SELECT DISTINCT cramo, ctipo, ccategotr FROM macattip WITH (NOLOCK) WHERE cramo <> @cramo) b
        ON b.ctipo = a.ctipo AND b.ccategotr = a.ccategotr
      ORDER BY a.ctipo, a.ccategotr, b.cramo;
      SELECT RTRIM(ccober) AS ccober, RTRIM(ctarifa) AS ctarifa, nantiguedad_desde AS desde, nantiguedad_hasta AS hasta, pprima
      FROM maplantar_ano WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V';`);
    const [cabeceras, otrosRamos, cobs, aranceles, frecuencias, usuarios, ramo18, pares, paresOtros, tasas] =
      r.recordsets as unknown as Fila[][];

    const coberturas18 = ramo18.map((f) => ({ ccobertura: rtrim(f.ccobertura), ccoberturaint: numOrNull(f.ccoberturaint) }));
    const vigente = cabeceras.find((c) => c.tabla === cab && rtrim(c.iestado) === 'V') ?? cabeceras.find((c) => c.tabla === cab) ?? cabeceras[0];
    const cproducto = rtrim(vigente?.cproducto);

    const agrupados = new Map<string, { ctipo: number; ccategotr: number; ramos: number[] }>();
    for (const p of paresOtros) {
      const k = `${p.ctipo}|${p.ccategotr}`;
      if (!agrupados.has(k)) agrupados.set(k, { ctipo: Number(p.ctipo), ccategotr: Number(p.ccategotr), ramos: [] });
      agrupados.get(k)!.ramos.push(Number(p.cramo));
    }

    const datos: DatosRevision = {
      cramo,
      cplan,
      familia,
      cabeceras: cabeceras.map((c) => ({
        tabla: c.tabla === 'maplanes_per' ? 'maplanes_per' : 'maplanes',
        iestado: c.iestado == null ? null : rtrim(c.iestado),
        cproducto: c.cproducto == null ? null : rtrim(c.cproducto),
      })),
      ramosConMismoPlan: otrosRamos.map((f) => Number(f.cramo)),
      productoExiste: cproducto ? await this.productoExiste(cproducto) : false,
      coberturas: cobs.map((c) => ({
        ccobertura: rtrim(c.ccobertura),
        ctarifa: rtrim(c.ctarifa),
        tarifaExiste: Number(c.tarifa_existe) === 1,
        detallesV: Number(c.detalles_v ?? 0),
        ccontrea: numOrNull(c.ccontrea),
        cramorea: numOrNull(c.cramorea),
        cob18: equivalenteRamo18(cramo, { ccobertura: rtrim(c.ccobertura), ccoberturaint: numOrNull(c.ccoberturaint) }, coberturas18),
      })),
      aranceles: aranceles.map((a) => ({
        cplan: rtrim(a.cplan), ctipoprod: Number(a.ctipoprod ?? 0), cproductor: Number(a.cproductor ?? 0),
        ccober: rtrim(a.ccober), ctarifa: rtrim(a.ctarifa), iestado: rtrim(a.iestado),
      })),
      frecuenciasV: frecuencias.map((f) => rtrim(f.ifrecuencia)),
      usuariosPermitidos: Number(usuarios[0]?.n ?? 0),
      auto: familia === 'auto'
        ? {
            paresTipoUso: Number(pares[0]?.n ?? 0),
            paresEnOtrosRamos: [...agrupados.values()],
            tasasAntiguedad: tasas.map((t) => ({
              ccober: rtrim(t.ccober), ctarifa: rtrim(t.ctarifa), desde: Number(t.desde), hasta: Number(t.hasta), pprima: Number(t.pprima),
            })),
          }
        : undefined,
      tablaPlan: cab,
      fase2: await this.datosFase2(cramo, cplan, personas, familia === 'patrimonial'),
    };
    return revisarPlan(datos);
  }

  /**
   * Tabla de cabecera del plan: la de la familia; si el plan no está ahí pero sí en la otra (ramo mixto, p. ej. 25 con
   * PAS en maplanes y VIAJE en maplanes_per), la otra.
   */
  private async tablaDelPlan(cramo: number, cplan: string, porFamilia: 'maplanes' | 'maplanes_per'): Promise<'maplanes' | 'maplanes_per'> {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`SELECT
      CASE WHEN EXISTS (SELECT 1 FROM maplanes WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan) THEN 1 ELSE 0 END AS cosas,
      CASE WHEN EXISTS (SELECT 1 FROM maplanes_per WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan) THEN 1 ELSE 0 END AS per`);
    const f = (r.recordset?.[0] ?? {}) as Fila;
    const enPropia = Number(porFamilia === 'maplanes' ? f.cosas : f.per) === 1;
    const enOtra = Number(porFamilia === 'maplanes' ? f.per : f.cosas) === 1;
    if (enPropia || !enOtra) return porFamilia;
    return porFamilia === 'maplanes' ? 'maplanes_per' : 'maplanes';
  }

  /** Fase 2: insramo; parentescos de tarifas y edades (plan de personas); % de madisseg/masustac (patrimonial). */
  private async datosFase2(cramo: number, cplan: string, personas: boolean, patrimonial: boolean): Promise<DatosRevisionFase2> {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`
      DECLARE @vig DATETIME = ISNULL(
        (SELECT MAX(fdesde_plan) FROM maplanes_per WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V'),
        (SELECT MAX(fdesde_plan) FROM maplanes_per WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan));
      SELECT COUNT(*) AS n FROM insramo WITH (NOLOCK) WHERE cramo = @cramo;
      SELECT DISTINCT cparen FROM mapltarifas_per WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig;
      SELECT DISTINCT cparen FROM mapledades_per WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig;
      SELECT 'madisseg' AS tabla, cdisseg AS codigo, RTRIM(xdisseg) AS descripcion, pdisseg AS porcentaje FROM madisseg WITH (NOLOCK) WHERE cramo = @cramo
      UNION ALL
      SELECT 'masustac', csustanc, RTRIM(xsustanc), porcenta FROM masustac WITH (NOLOCK) WHERE cramo = @cramo;`);
    const [insramo, parTarifa, parEdades, porcentajes] = r.recordsets as unknown as Fila[][];
    return {
      tieneInsramo: Number(insramo[0]?.n ?? 0) > 0,
      edades: personas
        ? { parentescosTarifa: parTarifa.map((f) => Number(f.cparen)), parentescosEdades: parEdades.map((f) => Number(f.cparen)) }
        : undefined,
      porcentajes: patrimonial
        ? porcentajes.map((p) => ({
            tabla: p.tabla === 'madisseg' ? 'madisseg' : 'masustac',
            codigo: Number(p.codigo),
            descripcion: rtrim(p.descripcion),
            porcentaje: numOrNull(p.porcentaje),
          }))
        : undefined,
    };
  }

  private async productoExiste(cproducto: string) {
    const req = this.db.request();
    req.input('cprod', sql.Char(40), cproducto);
    const r = await req.query('SELECT CASE WHEN EXISTS (SELECT 1 FROM maproductos WITH (NOLOCK) WHERE cproducto = @cprod) THEN 1 ELSE 0 END AS e');
    return r.recordset?.[0]?.e === 1;
  }
}
