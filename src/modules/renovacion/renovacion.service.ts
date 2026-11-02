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
  resolverTipoVehiculo,
  sugerirVigencia,
  cpolizaTxt,
  toIsoDate,
  txt,
} from './renovacion.util';

type Row = Record<string, unknown>;

export interface RenovacionQuery {
  centidad?: string;
  citem?: string;
  ctipo?: string;
  iplaca?: string;
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

    this.logger.log(
      `consultar ${cnpoliza}: cpoliza=${cpolizaTxt(pol)} periodo=${String(pol['fanopol'])}/${String(pol['fmespol'])} ` +
        `ctenedor=${String(pol['ctenedor'])} casegurado=${String(pol['casegurado'])} cramo=${cramo}`,
    );
    const [renovadaPor, recibosPendientes, clientes, vehiculo, asegurados, beneficiarios] =
      await Promise.all([
        this.safe(cnpoliza, 'renovadaPor', () => this.loadRenovadaPor(cnpoliza), null),
        this.safe(cnpoliza, 'recibosPendientes', () => this.countRecibosPendientes(pol), 0),
        this.safe(cnpoliza, 'clientes', () => this.loadClientes(pol), new Map<string, Row>()),
        rcv ? this.safe(cnpoliza, 'vehiculo', () => this.loadVehiculo(pol), null) : Promise.resolve(null),
        rcv ? Promise.resolve([] as Row[]) : this.safe(cnpoliza, 'asegurados', () => this.loadAsegurados(pol), [] as Row[]),
        this.safe(cnpoliza, 'beneficiarios', () => this.loadBeneficiarios(pol), [] as Row[]),
      ]);
    if (!clientes.size) this.logger.warn(`consultar ${cnpoliza}: sin filas en maclient para tomador/titular`);
    if (rcv && !vehiculo) this.logger.warn(`consultar ${cnpoliza}: sin filas en vhcerti`);
    if (!rcv && !asegurados.length) this.logger.warn(`consultar ${cnpoliza}: sin filas en peasegurados`);

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
    const tipoVehiculo = rcv ? resolverTipoVehiculo(vehiculo, cplan, query) : null;
    const planes = await this.loadPlanesHoy({
      cramo,
      rcv,
      cproducto,
      canal,
      cproductor: pol['cproductor'],
      ctipo: tipoVehiculo?.ctipo ?? null,
      iplaca: tipoVehiculo?.iplaca ?? null,
    });
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
    // Conductor habitual (vhcerti.xconductor → maclient); null si la póliza no lo tiene.
    const conductor = rcv && vehiculo
      ? await this.safe(cnpoliza, 'conductor', () => this.loadConductor(pol), null as Row | null)
      : null;
    return {
      cnpoliza,
      tipo: rcv ? 'RCV' : 'PERSONAS',
      poliza_origen: {
        cpoliza: cpolizaTxt(pol),
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
      conductor: rcv ? mapPersona(conductor) : null,
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
      canal_planes: planes.canal_usado ?? canal,
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

  /** Ejecuta una subconsulta; si falla deja el error real en pm2 logs y sigue con el valor por defecto. */
  private async safe<R>(cnpoliza: string, etiqueta: string, fn: () => Promise<R>, fallback: R): Promise<R> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`consultar ${cnpoliza} [${etiqueta}] falló: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  }

  /** Último periodo (fanopol/fmespol) de la póliza + descripciones. */
  private async loadPoliza(cnpoliza: string): Promise<Row | null> {
    const req = this.db.request();
    req.input('cnpoliza', T.VarChar(30), cnpoliza);
    const res = await req.query(`
      SELECT TOP 1
        p.*,
        CONVERT(varchar(20), p.cpoliza) AS cpoliza_txt,
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
    req.input('cpoliza', T.VarChar(20), cpolizaTxt(pol));
    req.input('fanopol', T.SmallInt, pol['fanopol']);
    req.input('fmespol', T.TinyInt, pol['fmespol']);
    const res = await req.query(`
      SELECT COUNT(*) AS n FROM adrecibos WITH (NOLOCK)
      WHERE cpoliza = CAST(@cpoliza AS NUMERIC(19, 0)) AND fanopol = @fanopol AND fmespol = @fmespol AND iestadorec = 'P'
    `);
    return Number(res.recordset?.[0]?.['n'] ?? 0);
  }

  /** Tomador, titular y beneficiario preferencial (maclient + primer tel/correo/dirección). */
  private async loadClientes(pol: Row): Promise<Map<string, Row>> {
    const out = new Map<string, Row>();
    const req = this.db.request();
    req.input('cpoliza', T.VarChar(20), cpolizaTxt(pol));
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
      WHERE p.cpoliza = CAST(@cpoliza AS NUMERIC(19, 0)) AND p.fanopol = @fanopol AND p.fmespol = @fmespol
    `);
    for (const row of (res.recordset ?? []) as Row[]) {
      const key = txt(row['cci_rif']);
      if (key) out.set(key, row);
    }
    return out;
  }

  /** Conductor habitual: el SP RCV guarda su cédula en vhcerti.xconductor y lo crea en maclient. */
  private async loadConductor(pol: Row): Promise<Row | null> {
    const req = this.db.request();
    req.input('cpoliza', T.VarChar(20), cpolizaTxt(pol));
    req.input('fanopol', T.SmallInt, pol['fanopol']);
    req.input('fmespol', T.TinyInt, pol['fmespol']);
    const res = await req.query(`
      SELECT TOP 1
        c.*,
        CONVERT(varchar(10), c.fnacimiento, 23) AS fnac_iso,
        (SELECT TOP 1 TRIM(t.xtelefono) FROM maclient_tel t WITH (NOLOCK) WHERE t.cci_rif = c.cci_rif) AS xtelefono_ren,
        (SELECT TOP 1 TRIM(e.xcorreo) FROM maclient_correo e WITH (NOLOCK) WHERE e.cci_rif = c.cci_rif) AS xcorreo_ren,
        d.cestado AS cestado_ren,
        d.cciudad AS cciudad_ren,
        TRIM(d.xavecalle) AS xdireccion_ren
      FROM vhcerti v WITH (NOLOCK)
      INNER JOIN maclient c WITH (NOLOCK) ON c.cci_rif = v.xconductor
      OUTER APPLY (SELECT TOP 1 cestado, cciudad, xavecalle FROM maclient_dir dd WITH (NOLOCK) WHERE dd.cci_rif = c.cci_rif) d
      WHERE v.cpoliza = CAST(@cpoliza AS NUMERIC(19, 0)) AND v.xconductor IS NOT NULL
      ORDER BY CASE WHEN v.fanopol = @fanopol AND v.fmespol = @fmespol THEN 0 ELSE 1 END, v.fanopol DESC, v.fmespol DESC
    `);
    return (res.recordset?.[0] as Row) ?? null;
  }

  private async loadVehiculo(pol: Row): Promise<Row | null> {
    const req = this.db.request();
    req.input('cpoliza', T.VarChar(20), cpolizaTxt(pol));
    req.input('fanopol', T.SmallInt, pol['fanopol']);
    req.input('fmespol', T.TinyInt, pol['fmespol']);
    const res = await req.query(`
      SELECT TOP 1
        v.*,
        TRIM(i.xmarca) AS xmarca_ren, TRIM(i.xmodelo) AS xmodelo_ren, TRIM(i.xversion) AS xversion_ren,
        (SELECT TOP 1 vi.ctipo FROM VInma vi WITH (NOLOCK)
          WHERE vi.cmarca = v.cmarca AND vi.cmodelo = v.cmodelo AND vi.cversion = v.cversion AND vi.cano = v.cano) AS ctipo_inma
      FROM vhcerti v WITH (NOLOCK)
      LEFT JOIN mavinma i WITH (NOLOCK)
        ON v.cano = i.qano AND v.cmarca = i.cmarca AND v.cmodelo = i.cmodelo AND v.cversion = i.cversion
      WHERE v.cpoliza = CAST(@cpoliza AS NUMERIC(19, 0))
      ORDER BY CASE WHEN v.fanopol = @fanopol AND v.fmespol = @fmespol THEN 0 ELSE 1 END, v.fanopol DESC, v.fmespol DESC
    `);
    return (res.recordset?.[0] as Row) ?? null;
  }

  private async loadAsegurados(pol: Row): Promise<Row[]> {
    const req = this.db.request();
    req.input('cpoliza', T.VarChar(20), cpolizaTxt(pol));
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
      WHERE a.cpoliza = CAST(@cpoliza AS NUMERIC(19, 0))
    `);
    return filtrarPorPeriodo((res.recordset ?? []) as Row[], pol['fanopol'], pol['fmespol']);
  }

  private async loadBeneficiarios(pol: Row): Promise<Row[]> {
    const req = this.db.request();
    req.input('cnpoliza', T.VarChar(30), txt(pol['cnpoliza']));
    req.input('fanopol', T.SmallInt, pol['fanopol']);
    req.input('fmespol', T.TinyInt, pol['fmespol']);
    const res = await req.query(`
      SELECT b.*
      FROM pebenefi b WITH (NOLOCK)
      WHERE RTRIM(b.cnpoliza) = @cnpoliza AND b.fanopol = @fanopol AND b.fmespol = @fmespol
    `);
    // iclaseaseg B = beneficiario (si la columna no viene, se toman todas).
    return ((res.recordset ?? []) as Row[]).filter((b) => {
      const clase = txt(b['iclaseaseg'])?.toUpperCase();
      return !clase || clase === 'B';
    });
  }

  /** Mismos servicios de planes que Emisión: RCV → spBuscaPlan (planes/v2); personas → sp_busca_plan_producto_nexus. */
  private async loadPlanesHoy(args: {
    cramo: number;
    rcv: boolean;
    cproducto: string | null;
    canal: { centidad: string; citem: string };
    cproductor: unknown;
    ctipo: number | null;
    iplaca: string | null;
  }): Promise<{
    items: ReturnType<typeof mapPlanDisponible>[];
    error: string | null;
    canal_usado: { centidad: string; citem: string } | null;
  }> {
    const productor = String(
      Number(txt(args.cproductor)) || Number(this.config.get('LAMUNDIAL_PRODUCTOR') ?? 80080) || 80080,
    );
    // Canal de la póliza primero; si falla o no trae planes, productor (como Emisión sin entidad: P/cproductor).
    const intentos = [args.canal];
    if (!(args.canal.centidad === 'P' && args.canal.citem === productor)) {
      intentos.push({ centidad: 'P', citem: productor });
    }
    const errores: string[] = [];
    for (const canal of intentos) {
      try {
        const items = await this.fetchPlanes(args, canal, Number(productor));
        if (items.length) return { items, error: null, canal_usado: canal };
        errores.push(`${canal.centidad}/${canal.citem}: sin planes`);
        this.logger.warn(`loadPlanesHoy ramo=${args.cramo} canal=${canal.centidad}/${canal.citem}: sin planes`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errores.push(`${canal.centidad}/${canal.citem}: ${msg}`);
        this.logger.warn(
          `loadPlanesHoy ramo=${args.cramo} producto=${args.cproducto} canal=${canal.centidad}/${canal.citem}: ${msg}`,
        );
      }
    }
    return { items: [], error: errores.join(' | '), canal_usado: null };
  }

  private async fetchPlanes(
    args: { cramo: number; rcv: boolean; cproducto: string | null; ctipo: number | null; iplaca: string | null },
    canal: { centidad: string; citem: string },
    cproductor: number,
  ): Promise<ReturnType<typeof mapPlanDisponible>[]> {
    if (args.rcv) {
      // Mismo body que Emisión (planesClient.buildPlanesV2Body): cusuario numérico, ctipo (VInma) e iplaca.
      const cusuario = String(
        this.config.get('LAMUNDIAL_CUSUARIO_PLANES') ?? this.config.get('LAMUNDIAL_CUSUARIO') ?? '4',
      );
      const dto = {
        centidad: canal.centidad,
        citem: canal.citem,
        cproductor,
        cusuario,
        cramo: args.cramo,
        ...(args.ctipo != null ? { ctipo: args.ctipo } : {}),
        ...(args.iplaca ? { iplaca: args.iplaca } : {}),
      } as GetPlanesV2Dto;
      this.logger.log(`planes/v2 renovacion body=${JSON.stringify(dto)}`);
      const { planes } = await this.valrep.getPlanesV2(dto);
      return (planes ?? []).map((p) => mapPlanDisponible(p as Row));
    }
    if (!args.cproducto) {
      throw new Error('El plan no tiene cproducto en maplanes_per; no se pudieron listar planes.');
    }
    const { planes } = await this.valrep.getPlanesProducto({
      cproducto: args.cproducto,
      centidad: canal.centidad,
      citem: canal.citem,
    });
    return (planes ?? [])
      .map((p) => mapPlanDisponible(p as Row))
      .filter((p) => p.cramo == null || p.cramo === args.cramo);
  }
}
