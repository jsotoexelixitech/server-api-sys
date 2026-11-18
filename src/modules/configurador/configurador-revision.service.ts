import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { equivalenteRamo18 } from './configurador.auto';
import { rtrim } from './configurador.comun';
import { revisarPlan, type DatosRevision, type RevisionPlan } from './configurador.revision';
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
    const personas = familia === 'personas';
    const cab = personas ? 'maplanes_per' : 'maplanes';
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
      SELECT RTRIM(cplan) AS cplan, RTRIM(ccober) AS ccober, RTRIM(ctarifa) AS ctarifa, RTRIM(iestado) AS iestado
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
      aranceles: aranceles.map((a) => ({ cplan: rtrim(a.cplan), ccober: rtrim(a.ccober), ctarifa: rtrim(a.ctarifa), iestado: rtrim(a.iestado) })),
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
    };
    return revisarPlan(datos);
  }

  private async productoExiste(cproducto: string) {
    const req = this.db.request();
    req.input('cprod', sql.Char(40), cproducto);
    const r = await req.query('SELECT CASE WHEN EXISTS (SELECT 1 FROM maproductos WITH (NOLOCK) WHERE cproducto = @cprod) THEN 1 ELSE 0 END AS e');
    return r.recordset?.[0]?.e === 1;
  }
}
