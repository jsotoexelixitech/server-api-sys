import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as T from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { ValrepService } from '../valrep/valrep.service';
import { GetPlanesV2Dto } from '../valrep/dto/get-planes-v2.dto';
import {
  DEFAULT_DIAS_ANTES,
  DEFAULT_DIAS_DESPUES,
  describirEstado,
  describirFrecuencia,
  esAnulada,
  esRcv,
  evaluarElegibilidad,
  filtrarPorPeriodo,
  mapAsegurado,
  mapBeneficiario,
  mapPersona,
  mapPlanDisponible,
  mapVehiculo,
  parseDiasEnv,
  resolverCanal,
  sugerirVigencia,
  toIsoDate,
  txt,
} from './renovacion.util';

type Row = Record<string, unknown>;

export interface RenovacionQuery {
  centidad?: string;
  citem?: string;
}

/**
 * Consulta de solo lectura para el flujo "Renovar": póliza origen, personas/vehículo,
 * elegibilidad y planes disponibles hoy. No emite ni escribe nada.
 */
@Injectable()
export class RenovacionService {
  private readonly logger = new Logger(RenovacionService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly valrep: ValrepService,
    private readonly config: ConfigService,
  ) {}

  async consultar(cnpolizaRaw: string, query: RenovacionQuery = {}, hoy = new Date().toISOString().slice(0, 10)) {
    const cnpoliza = String(cnpolizaRaw ?? '').trim();
    if (!/^[0-9A-Za-z-]{3,30}$/.test(cnpoliza)) {
      throw new BadRequestException('Número de póliza inválido.');
    }

    const pol = await this.loadPoliza(cnpoliza);
    if (!pol) throw new NotFoundException(`No se encontró la póliza N° ${cnpoliza}`);

    const cramo = Number(pol['cramo']);
    const rcv = esRcv(cramo);
    const fdesde = toIsoDate(pol['fdesde_iso'] as string);
    const fhasta = toIsoDate(pol['fhasta_iso'] as string);

    const [renovadaPor, recibosPendientes, clientes, vehiculo, asegurados, beneficiarios] =
      await Promise.all([
        this.loadRenovadaPor(cnpoliza),
        this.countRecibosPendientes(pol),
        this.loadClientes(pol),
        rcv ? this.loadVehiculo(pol) : Promise.resolve(null),
        rcv ? Promise.resolve([] as Row[]) : this.loadAsegurados(pol),
        this.loadBeneficiarios(pol),
      ]);

    const elegibilidad = evaluarElegibilidad({
      fhasta,
      hoy,
      anulada: esAnulada(pol),
      renovadaPor: renovadaPor?.cnpoliza ?? null,
      diasAntes: parseDiasEnv(this.config.get('RENOVACION_DIAS_ANTES'), DEFAULT_DIAS_ANTES),
      diasDespues: parseDiasEnv(this.config.get('RENOVACION_DIAS_DESPUES'), DEFAULT_DIAS_DESPUES),
    });

    const canal = resolverCanal(
      pol,
      query,
      String(this.config.get('LAMUNDIAL_PRODUCTOR') ?? '80080'),
    );
    const cplan = txt(pol['cplan']);
    const cproducto = txt(pol['cproducto_plan']) ?? (rcv ? '24' : null);
    const planes = await this.loadPlanesHoy({ cramo, rcv, cproducto, canal, cproductor: pol['cproductor'] });
    const disponibleEnCanal = planes.error
      ? null
      : planes.items.some((p) => p.cplan === cplan && (p.cramo == null || p.cramo === cramo));
    const planActivo = txt(pol['iestado_plan'])?.toUpperCase() === 'V';

    const vigencia = sugerirVigencia(fdesde, fhasta, hoy);
    const advertencias: string[] = [];
    if (recibosPendientes > 0) {
      advertencias.push(`La póliza origen tiene ${recibosPendientes} recibo(s) pendiente(s) de pago.`);
    }
    if (!planActivo) advertencias.push('El plan de la póliza ya no está activo en Sis2000 (maplanes iestado ≠ V).');
    if (disponibleEnCanal === false) advertencias.push('El plan actual no está disponible hoy para este canal; ofrezca uno de otros_planes.');

    const personas = clientes;
    return {
      cnpoliza,
      tipo: rcv ? 'RCV' : 'PERSONAS',
      poliza_origen: {
        cpoliza: txt(pol['cpoliza']),
        cnpoliza,
        cnpoliza_rel: txt(pol['cnpoliza_rel']),
        cramo,
        xramo: txt(pol['xramo_ren']),
        cplan,
        xplan: txt(pol['xplan_ren']),
        cproducto,
        ifrecuencia: txt(pol['ifrecuencia']),
        xfrecuencia: describirFrecuencia(pol['ifrecuencia']),
        cmoneda: txt(pol['cmoneda']),
        xmoneda: txt(pol['xmoneda_ren']),
        fdesde,
        fhasta,
        fanopol: pol['fanopol'] ?? null,
        fmespol: pol['fmespol'] ?? null,
        istatpol: txt(pol['istatpol']),
        iestado: txt(pol['iestado']),
        estado: describirEstado(pol, fhasta, hoy),
        itipopol: txt(pol['itipopol']),
        cproductor: txt(pol['cproductor']),
        xproductor: txt(pol['xproductor_ren']),
        ccanalalt: txt(pol['ccanalalt']),
        xcanalalt: txt(pol['xcanalalt_ren']),
        ctipocanal: txt(pol['ctipocanal']),
        cgestor: txt(pol['cgestor']),
        csucur: txt(pol['csucur']),
        recibos_pendientes: recibosPendientes,
      },
      tomador: mapPersona(personas.get(txt(pol['ctenedor']) ?? '')),
      titular: mapPersona(personas.get(txt(pol['casegurado']) ?? '')),
      beneficiario_preferencial: rcv ? mapPersona(personas.get(txt(pol['cbeneficiario']) ?? '')) : null,
      asegurados: asegurados.map(mapAsegurado),
      beneficiarios: beneficiarios.map(mapBeneficiario),
      vehiculo: mapVehiculo(vehiculo),
      elegible: elegibilidad.elegible,
      motivo: elegibilidad.motivo,
      mensaje: elegibilidad.mensaje,
      ventana: elegibilidad.ventana,
      dias_para_vencer: elegibilidad.dias_para_vencer,
      renovada_por: renovadaPor,
      fdesde_sugerida: vigencia.fdesde_sugerida,
      fhasta_sugerida: vigencia.fhasta_sugerida,
      continuidad: vigencia.continuidad,
      plan_actual: {
        cramo,
        cplan,
        xplan: txt(pol['xplan_ren']),
        cproducto,
        iestado: txt(pol['iestado_plan']),
        activo: planActivo,
        disponible_en_canal: disponibleEnCanal,
      },
      canal_planes: canal,
      otros_planes: planes.items.filter((p) => p.cplan !== cplan),
      planes_error: planes.error,
      advertencias,
      emision_sugerida: {
        flujo: 'renovacion',
        cnpoliza_rel: cnpoliza,
        itipoEmi: 'NU',
        nota: 'Póliza nueva enlazada (cnpoliza_rel). No usar RE: RE reutiliza el mismo cnpoliza en Sis2000.',
      },
    };
  }

  /** Último periodo (fanopol/fmespol) de la póliza + descripciones. */
  private async loadPoliza(cnpoliza: string): Promise<Row | null> {
    const req = this.db.request();
    req.input('cnpoliza', T.VarChar(30), cnpoliza);
    const res = await req.query(`
      SELECT TOP 1
        p.*,
        CONVERT(varchar(10), p.fdesde, 23) AS fdesde_iso,
        CONVERT(varchar(10), p.fhasta, 23) AS fhasta_iso,
        TRIM(r.xdescripcion_l) AS xramo_ren,
        TRIM(m.xdescripcion_l) AS xmoneda_ren,
        TRIM(pr.xproductor) AS xproductor_ren,
        TRIM(ca.xcanalalt) AS xcanalalt_ren,
        TRIM(CASE WHEN p.cramo = 18 THEN COALESCE(pl.xplan, plp.xplan) ELSE COALESCE(plp.xplan, pl.xplan) END) AS xplan_ren,
        TRIM(CASE WHEN p.cramo = 18 THEN COALESCE(pl.cproducto, plp.cproducto) ELSE COALESCE(plp.cproducto, pl.cproducto) END) AS cproducto_plan,
        TRIM(CASE WHEN p.cramo = 18 THEN COALESCE(pl.iestado, plp.iestado) ELSE COALESCE(plp.iestado, pl.iestado) END) AS iestado_plan
      FROM adpoliza p WITH (NOLOCK)
      LEFT JOIN maramos r WITH (NOLOCK) ON r.cramo = p.cramo
      LEFT JOIN mamonedas m WITH (NOLOCK) ON m.cmoneda = p.cmoneda
      LEFT JOIN maproduc pr WITH (NOLOCK) ON pr.cproductor = p.cproductor
      LEFT JOIN macanalalt ca WITH (NOLOCK) ON ca.ccanalalt = TRY_CAST(RTRIM(p.ccanalalt) AS SMALLINT)
      LEFT JOIN maplanes pl WITH (NOLOCK) ON pl.cramo = p.cramo AND pl.cplan = p.cplan
      LEFT JOIN maplanes_per plp WITH (NOLOCK) ON plp.cramo = p.cramo AND plp.cplan = p.cplan
      WHERE RTRIM(p.cnpoliza) = @cnpoliza
      ORDER BY p.fanopol DESC, p.fmespol DESC, p.fhasta DESC
    `);
    return (res.recordset?.[0] as Row) ?? null;
  }

  /** Póliza nueva ya emitida con cnpoliza_rel = origen (no anulada). */
  private async loadRenovadaPor(cnpoliza: string): Promise<{ cnpoliza: string; fdesde: string | null } | null> {
    const req = this.db.request();
    req.input('cnpoliza', T.VarChar(30), cnpoliza);
    const res = await req.query(`
      SELECT TOP 1 TRIM(cnpoliza) AS cnpoliza, CONVERT(varchar(10), fdesde, 23) AS fdesde
      FROM adpoliza WITH (NOLOCK)
      WHERE RTRIM(cnpoliza_rel) = @cnpoliza
        AND RTRIM(cnpoliza) <> @cnpoliza
        AND ISNULL(istatpol, '') <> 'A'
      ORDER BY fdesde DESC
    `);
    const row = res.recordset?.[0] as Row | undefined;
    return row?.['cnpoliza'] ? { cnpoliza: String(row['cnpoliza']), fdesde: txt(row['fdesde']) } : null;
  }

  private async countRecibosPendientes(pol: Row): Promise<number> {
    const req = this.db.request();
    req.input('cpoliza', T.Numeric(19, 0), pol['cpoliza']);
    req.input('fanopol', T.SmallInt, pol['fanopol']);
    req.input('fmespol', T.TinyInt, pol['fmespol']);
    const res = await req.query(`
      SELECT COUNT(*) AS n FROM adrecibos WITH (NOLOCK)
      WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND iestadorec = 'P'
    `);
    return Number(res.recordset?.[0]?.['n'] ?? 0);
  }

  /** Tomador, titular y beneficiario preferencial (maclient + primer tel/correo/dirección). */
  private async loadClientes(pol: Row): Promise<Map<string, Row>> {
    const out = new Map<string, Row>();
    const req = this.db.request();
    req.input('cpoliza', T.Numeric(19, 0), pol['cpoliza']);
    req.input('fanopol', T.SmallInt, pol['fanopol']);
    req.input('fmespol', T.TinyInt, pol['fmespol']);
    const res = await req.query(`
      SELECT
        c.*,
        CONVERT(varchar(10), c.fnacimiento, 23) AS fnac_iso,
        (SELECT TOP 1 TRIM(t.xtelefono) FROM maclient_tel t WITH (NOLOCK) WHERE t.cci_rif = c.cci_rif) AS xtelefono_ren,
        (SELECT TOP 1 TRIM(e.xcorreo) FROM maclient_correo e WITH (NOLOCK) WHERE e.cci_rif = c.cci_rif) AS xcorreo_ren,
        d.cestado AS cestado_ren,
        d.cciudad AS cciudad_ren,
        TRIM(d.xavecalle) AS xdireccion_ren
      FROM adpoliza p WITH (NOLOCK)
      CROSS APPLY (VALUES (p.ctenedor), (p.casegurado), (p.cbeneficiario)) ids(id)
      INNER JOIN maclient c WITH (NOLOCK) ON c.cci_rif = ids.id
      OUTER APPLY (SELECT TOP 1 cestado, cciudad, xavecalle FROM maclient_dir dd WITH (NOLOCK) WHERE dd.cci_rif = c.cci_rif) d
      WHERE p.cpoliza = @cpoliza AND p.fanopol = @fanopol AND p.fmespol = @fmespol
    `);
    for (const row of (res.recordset ?? []) as Row[]) {
      const key = txt(row['cci_rif']);
      if (key) out.set(key, row);
    }
    return out;
  }

  private async loadVehiculo(pol: Row): Promise<Row | null> {
    const req = this.db.request();
    req.input('cpoliza', T.Numeric(19, 0), pol['cpoliza']);
    req.input('fanopol', T.SmallInt, pol['fanopol']);
    req.input('fmespol', T.TinyInt, pol['fmespol']);
    const res = await req.query(`
      SELECT TOP 1
        v.*,
        TRIM(i.xmarca) AS xmarca_ren, TRIM(i.xmodelo) AS xmodelo_ren, TRIM(i.xversion) AS xversion_ren
      FROM vhcerti v WITH (NOLOCK)
      LEFT JOIN mavinma i WITH (NOLOCK)
        ON v.cano = i.qano AND v.cmarca = i.cmarca AND v.cmodelo = i.cmodelo AND v.cversion = i.cversion
      WHERE v.cpoliza = @cpoliza
      ORDER BY CASE WHEN v.fanopol = @fanopol AND v.fmespol = @fmespol THEN 0 ELSE 1 END, v.fanopol DESC, v.fmespol DESC
    `);
    return (res.recordset?.[0] as Row) ?? null;
  }

  private async loadAsegurados(pol: Row): Promise<Row[]> {
    const req = this.db.request();
    req.input('cpoliza', T.Numeric(19, 0), pol['cpoliza']);
    const res = await req.query(`
      SELECT
        a.*,
        CONVERT(varchar(10), a.fnacimiento, 23) AS fnac_iso,
        TRIM(c.cid) AS cid_cli, TRIM(c.xnombre) AS xnombre_cli, TRIM(c.xapellido) AS xapellido_cli,
        TRIM(c.xcliente) AS xcliente_cli, TRIM(c.isexo) AS isexo_cli, TRIM(c.iestado_civil) AS iestado_civil_cli,
        TRIM(mp.xparentesco) AS xparentesco_ren
      FROM peasegurados a WITH (NOLOCK)
      LEFT JOIN maclient c WITH (NOLOCK) ON c.cci_rif = CAST(a.casegurado AS VARCHAR(50))
      LEFT JOIN maparent mp WITH (NOLOCK) ON mp.cparentesco = a.cparentesco
      WHERE a.cpoliza = @cpoliza
    `);
    return filtrarPorPeriodo((res.recordset ?? []) as Row[], pol['fanopol'], pol['fmespol']);
  }

  private async loadBeneficiarios(pol: Row): Promise<Row[]> {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.VarChar(30), txt(pol['cnpoliza']));
      req.input('fanopol', T.SmallInt, pol['fanopol']);
      req.input('fmespol', T.TinyInt, pol['fmespol']);
      const res = await req.query(`
        SELECT b.*
        FROM pebenefi b WITH (NOLOCK)
        WHERE RTRIM(b.cnpoliza) = @cnpoliza AND b.fanopol = @fanopol AND b.fmespol = @fmespol
          AND ISNULL(b.iclaseaseg, 'B') = 'B'
      `);
      return (res.recordset ?? []) as Row[];
    } catch (err) {
      this.logger.warn(`loadBeneficiarios ${String(pol['cnpoliza'])}: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  /** Mismos servicios de planes que Emisión: RCV → spBuscaPlan (planes/v2); personas → sp_busca_plan_producto_nexus. */
  private async loadPlanesHoy(args: {
    cramo: number;
    rcv: boolean;
    cproducto: string | null;
    canal: { centidad: string; citem: string };
    cproductor: unknown;
  }): Promise<{ items: ReturnType<typeof mapPlanDisponible>[]; error: string | null }> {
    try {
      if (args.rcv) {
        const productor = Number(txt(args.cproductor)) || Number(this.config.get('LAMUNDIAL_PRODUCTOR') ?? 80080);
        const dto = {
          cramo: args.cramo,
          cproductor: productor,
          cusuario: 'renovacion',
          centidad: args.canal.centidad,
          citem: args.canal.citem,
          cproducto: args.cproducto ?? undefined,
        } as GetPlanesV2Dto;
        const { planes } = await this.valrep.getPlanesV2(dto);
        return { items: (planes ?? []).map((p) => mapPlanDisponible(p as Row)), error: null };
      }
      if (!args.cproducto) {
        return { items: [], error: 'El plan no tiene cproducto en maplanes_per; no se pudieron listar planes.' };
      }
      const { planes } = await this.valrep.getPlanesProducto({
        cproducto: args.cproducto,
        centidad: args.canal.centidad,
        citem: args.canal.citem,
      });
      const items = (planes ?? [])
        .map((p) => mapPlanDisponible(p as Row))
        .filter((p) => p.cramo == null || p.cramo === args.cramo);
      return { items, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`loadPlanesHoy ramo=${args.cramo} producto=${args.cproducto}: ${msg}`);
      return { items: [], error: msg };
    }
  }
}
