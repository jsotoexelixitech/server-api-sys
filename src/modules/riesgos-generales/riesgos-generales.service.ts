import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { parseSPError, toUserFacingError } from '../../common/helpers/sp-error.helper';
import { buildPolicyPdfUrl } from '../../common/helpers/policy-url.helper';
import { SP_PRE_EMISION_CONDOMINIO } from '../../config/sis2000-sp.constants';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import {
  RAMOS_CON_UNIDAD, RAMO_RCV, calcularCoberturas, calcularCoberturasInformadas, calcularCoberturasRamo, componerDatosBien,
  erroresCoberturasSp, esObligatoria, mapCoberturaRamo, mapRamoPatrimonial, parsearRamosCotizador, parsearRamosEmision, sumarMeses,
  traducirDuplicadoSp,
  type ChequeoCobertura, type CoberturaTarifa, type CotizacionCalculada, type DatoBien, type DatosBienCompuestos,
} from './riesgos-generales.calculo';
import { calcularBiomasa, datosBienBiomasa, patronLote, type ResultadoBiomasa } from './riesgos-generales.biomasa';
import {
  type CoberturasBaseDto, CoberturasRamoDto, CotizarCoberturasDto, EmitirCoberturasDto, PersonaRiesgoDto, RAMOS_BIOMASA, TarifaPlanDto,
} from './dto/riesgos-generales.dto';

/** Usuario Sis2000 de las emisiones Nexus de riesgos generales (mismo que condominio). */
const CUSUARIO_NEXUS = 20364172;

type CotizacionConBien = CotizacionCalculada & { biomasa?: ResultadoBiomasa; datos_bien?: DatosBienCompuestos; aviso_lote?: string };

/** Plan contenedor (maplanes del ramo) y ramo, consultados antes de emitir. */
interface ContextoPlan {
  /** maplanes.iestado del plan en el ramo; null si el plan no existe en ese ramo. */
  iestado: string | null;
  cmoneda: string;
  ptasamon: number;
  /** Otro ramo donde el plan sí está vigente (para el mensaje). */
  cramo_otro: number | null;
  /** El ramo es patrimonial vigente (ctiporamo 1 y 6, sin RCV). */
  patrimonial: boolean;
}

/**
 * Riesgos generales por cobertura (cotizador RC): tarifa del plan, cotización y emisión con las coberturas
 * y sumas elegidas. La prima se calcula siempre aquí (suma × tasa de matarifa_d); el cliente solo manda
 * coberturas y sumas. La emisión usa sp_pre_emision_condominio_nexus con @coberturas, que graba cada
 * cobertura tal como se envía (sp_emision_condominio_nexus no recalcula cuando hay cotización preestablecida).
 * Excepción: `modo: cotizador` acepta la prima por cobertura que fija el cotizador RC o Técnico (ramos sin tarifa), con
 * las protecciones de exigirModoCotizador.
 */
@Injectable()
export class RiesgosGeneralesService {
  private readonly logger = new Logger(RiesgosGeneralesService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  /** Coberturas del plan (maplantar) con tasa y topes vigentes (matarifa_d), obligatoriedad (matarifa) y comisión. */
  async getTarifa(dto: TarifaPlanDto) {
    const T = this.db.types;
    const req = this.db.request();
    req.input('cramo', T.Int, dto.cramo);
    req.input('cplan', T.VarChar(10), dto.cplan.trim());
    const result = await req.query(`
      SELECT RTRIM(p.cplan) AS cplan, RTRIM(p.xplan) AS xplan, RTRIM(p.cmoneda) AS cmoneda,
             RTRIM(pt.ccober) AS ccober, RTRIM(pt.ctarifa) AS ctarifa, RTRIM(c.xdescripcion_l) AS xcobertura,
             pt.msumamax AS msumaplan, t.bobligatoria,
             ISNULL(d.pprima, 0) AS pprima, ISNULL(d.msumamin, 0) AS msumamin, ISNULL(d.msumamax, 0) AS msumamax,
             ISNULL(ara.pcomision, 0) AS pcomision
      FROM maplantar pt WITH (NOLOCK)
      INNER JOIN maplanes p WITH (NOLOCK) ON p.cramo = pt.cramo AND p.cplan = pt.cplan AND p.iestado = 'V'
      INNER JOIN macoberturas c WITH (NOLOCK) ON c.cramo = pt.cramo AND c.ccobertura = pt.ccober
      LEFT JOIN matarifa t WITH (NOLOCK) ON t.cramo = pt.cramo AND t.ccober = pt.ccober AND t.ctarifa = pt.ctarifa
      OUTER APPLY (
        SELECT TOP 1 x.pprima, x.msumamin, x.msumamax
        FROM matarifa_d x WITH (NOLOCK)
        WHERE x.cramo = pt.cramo AND x.ccober = pt.ccober AND x.ctarifa = pt.ctarifa AND x.iestado = 'V'
          AND x.fdesde <= GETDATE() AND (x.fhasta IS NULL OR x.fhasta >= GETDATE())
        ORDER BY x.fdesde DESC
      ) d
      LEFT JOIN maarancel ara WITH (NOLOCK) ON ara.cramo = pt.cramo AND ara.iestado = 'V' AND ara.ctarifa = pt.ctarifa
      WHERE pt.cramo = @cramo AND RTRIM(pt.cplan) = @cplan AND pt.iestado = 'V'
      ORDER BY CASE WHEN RTRIM(pt.ccober) = '1' THEN 0 ELSE 1 END, TRY_CAST(RTRIM(pt.ccober) AS INT), pt.ccober`);
    const rows = (result.recordset ?? []) as Record<string, unknown>[];
    if (!rows.length) throw new NotFoundException(`El plan ${dto.cplan} del ramo ${dto.cramo} no está vigente o no tiene coberturas.`);
    const coberturas: CoberturaTarifa[] = rows.map((r) => ({
      ccober: String(r.ccober).trim(),
      ctarifa: String(r.ctarifa).trim(),
      xcobertura: String(r.xcobertura ?? '').trim(),
      msumaplan: Number(r.msumaplan ?? 0),
      pprima: Number(r.pprima ?? 0),
      msumamin: Number(r.msumamin ?? 0),
      msumamax: Number(r.msumamax ?? 0),
      obligatoria: String(r.bobligatoria ?? '').trim().toUpperCase() === 'T',
      pcomision: Number(r.pcomision ?? 0),
    }));
    return {
      cramo: dto.cramo,
      cplan: String(rows[0].cplan),
      xplan: String(rows[0].xplan ?? ''),
      cmoneda: String(rows[0].cmoneda ?? '$'),
      coberturas: coberturas.map((c) => ({ ...c, obligatoria: esObligatoria(c) })),
    };
  }

  /**
   * Coberturas activas del ramo con tarifa vigente, sin plan (el cotizador RC arma con ellas las combinaciones).
   * Una cobertura con varias tarifas vigentes en matarifa sale una vez por tarifa.
   */
  async getCoberturasRamo(dto: CoberturasRamoDto) {
    const req = this.db.request();
    req.input('cramo', this.db.types.Int, dto.cramo);
    const result = await req.query(`
      SELECT RTRIM(c.ccobertura) AS ccober, RTRIM(t.ctarifa) AS ctarifa, RTRIM(c.xdescripcion_l) AS xcobertura,
             RTRIM(c.cmoneda) AS cmoneda, t.bobligatoria,
             d.pprima, d.mprima, d.msumamin, d.msumamax, ara.pcomision
      FROM macoberturas c WITH (NOLOCK)
      INNER JOIN matarifa t WITH (NOLOCK) ON t.cramo = c.cramo AND t.ccober = c.ccobertura AND t.iestado = 'V'
      CROSS APPLY (
        SELECT TOP 1 x.pprima, x.mprima, x.msumamin, x.msumamax
        FROM matarifa_d x WITH (NOLOCK)
        WHERE x.cramo = t.cramo AND x.ccober = t.ccober AND x.ctarifa = t.ctarifa AND x.iestado = 'V'
          AND x.fdesde <= GETDATE() AND (x.fhasta IS NULL OR x.fhasta >= GETDATE())
        ORDER BY x.fdesde DESC
      ) d
      OUTER APPLY (
        SELECT TOP 1 a.pcomision
        FROM maarancel a WITH (NOLOCK)
        WHERE a.cramo = c.cramo AND a.iestado = 'V' AND a.ctarifa = t.ctarifa
      ) ara
      WHERE c.cramo = @cramo AND c.iestado = 'V'
      ORDER BY CASE WHEN RTRIM(c.ccobertura) = '1' THEN 0 ELSE 1 END, TRY_CAST(RTRIM(c.ccobertura) AS INT), c.ccobertura, t.ctarifa`);
    const rows = (result.recordset ?? []) as Record<string, unknown>[];
    if (!rows.length) throw new NotFoundException(`El ramo ${dto.cramo} no tiene coberturas con tarifa vigente.`);
    return { cramo: dto.cramo, coberturas: rows.map((r) => mapCoberturaRamo(r)) };
  }

  /**
   * Ramos patrimoniales vigentes (maramos.ctiporamo 1 y 6, sin RCV ramo 26), tengan o no planes. `qcoberturas` cuenta
   * las coberturas activas con tarifa vigente, con las mismas condiciones de getCoberturasRamo (0 = no cotizable).
   */
  async getRamos() {
    const result = await this.db.request().query(`
      SELECT r.cramo, RTRIM(r.xdescripcion_l) AS xramo, r.ctiporamo, k.qcoberturas
      FROM maramos r WITH (NOLOCK)
      OUTER APPLY (
        SELECT COUNT(DISTINCT c.ccobertura) AS qcoberturas
        FROM macoberturas c WITH (NOLOCK)
        INNER JOIN matarifa t WITH (NOLOCK) ON t.cramo = c.cramo AND t.ccober = c.ccobertura AND t.iestado = 'V'
        WHERE c.cramo = r.cramo AND c.iestado = 'V'
          AND EXISTS (
            SELECT 1
            FROM matarifa_d x WITH (NOLOCK)
            WHERE x.cramo = t.cramo AND x.ccober = t.ccober AND x.ctarifa = t.ctarifa AND x.iestado = 'V'
              AND x.fdesde <= GETDATE() AND (x.fhasta IS NULL OR x.fhasta >= GETDATE())
          )
      ) k
      WHERE r.ctiporamo IN (1, 6) AND r.iestado = 'V' AND r.cramo <> 26
      ORDER BY xramo, r.cramo`);
    return ((result.recordset ?? []) as Record<string, unknown>[]).map((r) => mapRamoPatrimonial(r));
  }

  /**
   * Plan contenedor y ramo en una sola consulta: estado del plan en el ramo, moneda y tasa de cambio, otro ramo donde
   * el plan esté vigente (para el mensaje) y si el ramo es patrimonial vigente (ctiporamo 1 y 6, sin RCV).
   */
  private async contextoPlan(cramo: number, cplan: string): Promise<ContextoPlan> {
    const T = this.db.types;
    const result = await this.db.request()
      .input('cramo', T.Int, cramo)
      .input('cplan', T.VarChar(10), cplan.trim())
      .query(`
        SELECT pl.iestado, pl.cmoneda, pl.ptasamon, o.cramo_otro, rm.qramo
        FROM (SELECT 1 AS uno) b
        OUTER APPLY (
          SELECT TOP 1 RTRIM(p.iestado) AS iestado, RTRIM(p.cmoneda) AS cmoneda, m.ptasamon
          FROM maplanes p WITH (NOLOCK)
          LEFT JOIN mamonedas m WITH (NOLOCK) ON m.cmoneda = p.cmoneda
          WHERE p.cramo = @cramo AND RTRIM(p.cplan) = @cplan
          ORDER BY CASE WHEN p.iestado = 'V' THEN 0 ELSE 1 END
        ) pl
        OUTER APPLY (
          SELECT TOP 1 x.cramo AS cramo_otro
          FROM maplanes x WITH (NOLOCK)
          WHERE RTRIM(x.cplan) = @cplan AND x.cramo <> @cramo AND x.iestado = 'V'
          ORDER BY x.cramo
        ) o
        OUTER APPLY (
          SELECT COUNT(*) AS qramo
          FROM maramos r WITH (NOLOCK)
          WHERE r.cramo = @cramo AND r.iestado = 'V' AND r.ctiporamo IN (1, 6) AND r.cramo <> 26
        ) rm`);
    const r = (result.recordset?.[0] ?? {}) as Record<string, unknown>;
    return {
      iestado: r.iestado == null ? null : String(r.iestado).trim(),
      cmoneda: String(r.cmoneda ?? '$').trim() || '$',
      ptasamon: Number(r.ptasamon ?? 0) || 1,
      cramo_otro: r.cramo_otro == null ? null : Number(r.cramo_otro),
      patrimonial: Number(r.qramo ?? 0) > 0,
    };
  }

  /** El plan debe existir vigente en el mismo ramo: es el contenedor de la póliza (moneda, cplan y regla de duplicados). */
  private exigirPlanVigente(cramo: number, cplan: string, ctx: ContextoPlan) {
    if (ctx.iestado === 'V') return;
    if (ctx.iestado) throw new BadRequestException(`El plan ${cplan} del ramo ${cramo} no está vigente en Sis2000: elija un plan vigente del ramo.`);
    if (ctx.cramo_otro != null) {
      throw new BadRequestException(`El plan ${cplan} no es del ramo ${cramo} (es del ramo ${ctx.cramo_otro}): elija un plan vigente del ramo ${cramo}.`);
    }
    throw new BadRequestException(`El plan ${cplan} no existe en el ramo ${cramo}: elija un plan vigente del ramo.`);
  }

  /** RIESGOS_GENERALES_RAMOS_EMISION: lista de cramo o 'todos' (patrimonial vigente, sin RCV). Por defecto 16, 25 y 38. */
  private async exigirRamoEmitible(cramo: number, ctx: () => Promise<ContextoPlan>) {
    const config = parsearRamosEmision(this.config.get<string>('RIESGOS_GENERALES_RAMOS_EMISION'));
    if (cramo === RAMO_RCV) throw new BadRequestException('El ramo 26 (RCV) no se emite por esta ruta.');
    if (config === 'todos') {
      if (!(await ctx()).patrimonial) {
        throw new BadRequestException(`El ramo ${cramo} no es un ramo patrimonial vigente (ctiporamo 1 o 6): no se puede emitir por esta ruta.`);
      }
      return;
    }
    if (!config.includes(cramo)) {
      throw new BadRequestException(`El ramo ${cramo} no está habilitado para emitir por coberturas (ramos habilitados: ${config.join(', ')}).`);
    }
  }

  /**
   * Antes del SP, en una sola consulta: cada cobertura existe activa en macoberturas del ramo, tiene fila en matarifa y
   * exactamente una en matarifa_d. sp_emision_condominio_nexus une con matarifa_d sin filtrar vigencia: con 0 filas la
   * cobertura desaparece de la póliza y con 2 o más se duplica.
   */
  private async validarCoberturasSp(cramo: number, coberturas: { ccober: string; ctarifa: string }[]) {
    const T = this.db.types;
    const result = await this.db.request()
      .input('cramo', T.Int, cramo)
      .input('coberturas', T.NVarChar(T.MAX), JSON.stringify(coberturas.map((c) => ({ ccober: c.ccober, ctarifa: c.ctarifa }))))
      .query(`
        SELECT j.ccober, j.ctarifa, mc.iestado,
               (SELECT COUNT(*) FROM matarifa t WITH (NOLOCK)
                 WHERE t.cramo = @cramo AND t.ccober = j.ccober AND t.ctarifa = j.ctarifa) AS qtarifa,
               (SELECT COUNT(*) FROM matarifa_d d WITH (NOLOCK)
                 WHERE d.cramo = @cramo AND d.ccober = j.ccober AND d.ctarifa = j.ctarifa) AS qdetalle
        FROM OPENJSON(@coberturas) WITH (ccober VARCHAR(10) '$.ccober', ctarifa VARCHAR(10) '$.ctarifa') j
        OUTER APPLY (
          SELECT TOP 1 RTRIM(c.iestado) AS iestado
          FROM macoberturas c WITH (NOLOCK)
          WHERE c.cramo = @cramo AND c.ccobertura = j.ccober
          ORDER BY CASE WHEN c.iestado = 'V' THEN 0 ELSE 1 END
        ) mc`);
    const filas: ChequeoCobertura[] = ((result.recordset ?? []) as Record<string, unknown>[]).map((r) => ({
      ccober: String(r.ccober ?? '').trim(),
      ctarifa: String(r.ctarifa ?? '').trim(),
      iestado: r.iestado == null ? null : String(r.iestado),
      qtarifa: Number(r.qtarifa ?? 0),
      qdetalle: Number(r.qdetalle ?? 0),
    }));
    if (filas.length !== coberturas.length) throw new InternalServerErrorException('No se pudieron validar las coberturas antes de emitir.');
    const errores = erroresCoberturasSp(cramo, filas);
    if (errores.length) throw new BadRequestException(errores.join(' '));
  }

  /**
   * Modo cotizador (prima informada por el cotizador RC o Técnico). La prima viene del cliente, así que se protege con
   * tres llaves: RIESGOS_GENERALES_EMISION_COTIZADOR=true (apagado por defecto), el scope
   * `emissions:riesgos-generales-prima` escrito tal cual en la key (los comodines `*` y `emissions:*` no cuentan; con la
   * autenticación apagada tampoco pasa) y el ramo en RIESGOS_GENERALES_COTIZADOR_RAMOS (por defecto 27, 28 y 37), que
   * además debe ser patrimonial vigente. RCV (26) nunca.
   */
  private async exigirModoCotizador(cramo: number, scopes: string[] | undefined, ctx: () => Promise<ContextoPlan>) {
    if (String(this.config.get<string>('RIESGOS_GENERALES_EMISION_COTIZADOR') ?? '').trim().toLowerCase() !== 'true') {
      throw new ForbiddenException('La emisión con prima informada (modo cotizador) no está habilitada en este ambiente (RIESGOS_GENERALES_EMISION_COTIZADOR).');
    }
    if (!(scopes ?? []).includes(NEST_AUTH_SCOPES.EMISSIONS_RIESGOS_GENERALES_PRIMA)) {
      throw new ForbiddenException(`Permiso requerido: ${NEST_AUTH_SCOPES.EMISSIONS_RIESGOS_GENERALES_PRIMA} (explícito en la key) para emitir con prima informada.`);
    }
    if (cramo === RAMO_RCV) throw new BadRequestException('El ramo 26 (RCV) no se emite por esta ruta.');
    const ramos = parsearRamosCotizador(this.config.get<string>('RIESGOS_GENERALES_COTIZADOR_RAMOS'));
    if (!ramos.includes(cramo)) {
      throw new BadRequestException(`El ramo ${cramo} no está habilitado para emitir con prima informada (ramos habilitados: ${ramos.join(', ')}).`);
    }
    if (!(await ctx()).patrimonial) {
      throw new BadRequestException(`El ramo ${cramo} no es un ramo patrimonial vigente (ctiporamo 1 o 6): no se puede emitir por esta ruta.`);
    }
  }

  /** Modo cotizador: coberturas del ramo con la prima informada, validadas sin recalcular (calcularCoberturasInformadas). */
  private async calcularInformado(dto: EmitirCoberturasDto, ctx: ContextoPlan): Promise<CotizacionConBien> {
    if (dto.calculo || dto.biomasa) throw new BadRequestException('El modo cotizador no admite calculo ni biomasa: envíe la suma y la prima de cada cobertura.');
    const { coberturas } = await this.getCoberturasRamo({ cramo: dto.cramo });
    const { cotizacion, errores } = calcularCoberturasInformadas(coberturas, dto.coberturas, dto.prima_total, ctx.cmoneda);
    if (!cotizacion) throw new BadRequestException(errores.join(' '));
    const origen = String(dto.cotizador ?? '').toUpperCase();
    const datos: DatoBien[] = [
      { etiqueta: 'Cotización', valor: [origen, String(dto.ncotizacion ?? '').trim()].filter(Boolean).join(' ') || 'cotizador RC' },
      ...(dto.datos_bien ?? []),
    ];
    return { ...cotizacion, datos_bien: componerDatosBien(datos) };
  }

  async cotizar(dto: CotizarCoberturasDto): Promise<CotizacionConBien> {
    const cot = await this.calcular(dto);
    const lote = cot.biomasa?.lote;
    if (!lote) return cot;
    // Solo informa: sin el número de póliza, y si la consulta falla la cotización sale igual.
    try {
      const poliza = await this.polizaVigentePorLote(dto.cramo, lote, new Date().toISOString().split('T')[0]);
      return poliza ? { ...cot, aviso_lote: `El lote ${lote} ya está asegurado en una póliza vigente; no se podrá emitir otra.` } : cot;
    } catch (err) {
      this.logger.warn(`cotizar: no se pudo consultar el lote: ${parseSPError(err)}`);
      return cot;
    }
  }

  /**
   * Modo `plan`: coberturas y tasas del plan (maplantar). Modo `combo`: cualquier cobertura del ramo con tarifa vigente;
   * el plan solo es contenedor (debe estar vigente en el ramo). `ctx` evita repetir la consulta del plan al emitir.
   */
  private async calcular(dto: CoberturasBaseDto, ctx?: ContextoPlan): Promise<CotizacionConBien> {
    if (dto.modo === 'cotizador') {
      throw new BadRequestException('El modo cotizador solo se usa para emitir (POST emision): la prima la informa el cotizador RC o Técnico.');
    }
    let cmoneda: string;
    let res: ReturnType<typeof calcularCoberturas>;
    if (dto.modo === 'combo') {
      const plan = ctx ?? await this.contextoPlan(dto.cramo, dto.cplan);
      this.exigirPlanVigente(dto.cramo, dto.cplan.trim(), plan);
      const { coberturas } = await this.getCoberturasRamo({ cramo: dto.cramo });
      cmoneda = plan.cmoneda;
      res = calcularCoberturasRamo(coberturas, dto.coberturas, dto.calculo);
    } else {
      const tarifa = await this.getTarifa(dto);
      cmoneda = tarifa.cmoneda;
      res = calcularCoberturas(tarifa.coberturas, dto.coberturas, dto.calculo);
    }
    const { cotizacion, errores } = res;
    if (!cotizacion) throw new BadRequestException(errores.join(' '));
    const biomasa = dto.biomasa ? this.proyectarBiomasa(dto) : undefined;
    const datos: DatoBien[] = [...(biomasa ? datosBienBiomasa(biomasa, cmoneda) : []), ...(dto.datos_bien ?? [])];
    if (!datos.length) return cotizacion;
    return { ...cotizacion, ...(biomasa ? { biomasa } : {}), datos_bien: componerDatosBien(datos) };
  }

  /**
   * Póliza vigente con ese lote en rgcerti.xdescrip3, sin importar tomador, asegurado ni plan. Vigencia igual a la del
   * SP de pre-emisión; adAnulaPoliza deja iestado en 'N'. El patrón va por parámetro: ver patronLote.
   */
  private async polizaVigentePorLote(cramo: number, lote: string, fdesde: string): Promise<string | null> {
    const T = this.db.types;
    const result = await this.db.request()
      .input('cramo', T.Int, cramo)
      .input('fdesde', T.Date, fdesde)
      .input('patron', T.VarChar(100), patronLote(lote))
      .query(`
        SELECT TOP 1 RTRIM(p.cnpoliza) AS cnpoliza
        FROM adpoliza p WITH (NOLOCK)
        INNER JOIN rgcerti r WITH (NOLOCK)
          ON r.cramo = p.cramo AND r.cpoliza = p.cpoliza AND r.fanopol = p.fanopol AND r.fmespol = p.fmespol
        WHERE p.cramo = @cramo AND p.iestado = 'V' AND p.fhasta > @fdesde
          AND UPPER(LTRIM(r.xdescrip3)) LIKE @patron ESCAPE '!'
        ORDER BY p.fhasta DESC`);
    const fila = result.recordset?.[0] as { cnpoliza?: string } | undefined;
    return fila ? String(fila.cnpoliza ?? '').trim() : null;
  }

  private proyectarBiomasa(dto: CoberturasBaseDto): ResultadoBiomasa {
    if (!(RAMOS_BIOMASA as readonly number[]).includes(dto.cramo)) {
      throw new BadRequestException(`El ramo ${dto.cramo} no admite el bloque biomasa.`);
    }
    if (!dto.calculo) throw new BadRequestException('El bloque biomasa requiere calculo con B0 (unidades) y precio por kg (valor_unidad).');
    const { biomasa, errores } = calcularBiomasa({
      ...dto.biomasa!, b0: dto.calculo.unidades, precio_kg: dto.calculo.valor_unidad,
    });
    if (!biomasa) throw new BadRequestException(errores.join(' '));
    return biomasa;
  }

  /** `scopes`: los de la key o sesión del request (solo los usa el modo cotizador). */
  async emitir(dto: EmitirCoberturasDto, scopes?: string[]) {
    if (dto.biomasa && (!dto.biomasa.lote?.trim() || !dto.biomasa.ihl?.trim())) {
      throw new BadRequestException('Para emitir, el bloque biomasa debe traer lote e ihl.');
    }
    if (dto.biomasa && dto.meses && dto.meses !== dto.biomasa.horizonte_meses) {
      throw new BadRequestException(`meses (${dto.meses}) no coincide con horizonte_meses (${dto.biomasa.horizonte_meses}).`);
    }
    if ((RAMOS_CON_UNIDAD as readonly number[]).includes(dto.cramo) && !(Number(dto.apartamento) > 0)) {
      throw new BadRequestException(`En el ramo ${dto.cramo} el número de apartamento o unidad es obligatorio: Sis2000 no permite dos pólizas vigentes con el mismo asegurado, plan y unidad.`);
    }
    const cplan = dto.cplan.trim();
    let ctxCache: ContextoPlan | undefined;
    const ctx = async () => (ctxCache ??= await this.contextoPlan(dto.cramo, cplan));
    const informada = dto.modo === 'cotizador';
    if (informada) await this.exigirModoCotizador(dto.cramo, scopes, ctx);
    else await this.exigirRamoEmitible(dto.cramo, ctx);
    this.exigirPlanVigente(dto.cramo, cplan, await ctx());
    const cot = informada ? await this.calcularInformado(dto, await ctx()) : await this.calcular(dto, await ctx());
    if (cot.datos_bien?.omitidos.length) {
      this.logger.warn(`emitir: datos del bien sin espacio en xdescrip3/4: ${cot.datos_bien.omitidos.join(', ')}`);
    }
    const T = this.db.types;
    const hoy = new Date();
    const ymd = (d: Date) => d.toISOString().split('T')[0];
    const fdesde = ymd(hoy);
    // Vigencia: `meses` (respeta el fin de mes) o 1 año como hasta ahora.
    const hasta = new Date(hoy);
    const meses = dto.meses ?? dto.biomasa?.horizonte_meses;
    if (meses) hasta.setTime(sumarMeses(hoy, meses).getTime());
    else hasta.setFullYear(hasta.getFullYear() + 1);

    const tasa = (await ctx()).ptasamon;

    const tomador = dto.tomador;
    const asegurado = dto.asegurado ?? dto.tomador;
    const rifTomador = this.rif(tomador.rif);
    const rifAsegurado = this.rif(asegurado.rif);
    if (!rifTomador || !rifAsegurado) throw new BadRequestException('El RIF o la cédula del tomador y del asegurado son obligatorios.');

    // Un lote, una póliza vigente. La validación del SP (asegurado + plan) sigue aparte y no cambia.
    const lote = cot.biomasa?.lote;
    if (lote) {
      const poliza = await this.polizaVigentePorLote(dto.cramo, lote, fdesde);
      if (poliza !== null) {
        throw new ConflictException(`El lote ${lote} ya está asegurado en la póliza vigente ${poliza}. Un lote no puede tener dos pólizas vigentes, aunque cambien el tomador o el plan.`);
      }
    }

    await this.validarCoberturasSp(dto.cramo, cot.coberturas);

    const coberturasJson = JSON.stringify(cot.coberturas.map((c) => ({
      ccober: c.ccober, ctarifa: c.ctarifa, msumaasegext: c.suma_asegurada, mprimabrutaext: c.prima,
      mdescuentoext: 0, mrecargoext: 0, mprimaext: c.prima, pcomision: c.pcomision, mcomisionext: c.comision,
    })));
    const pcomision = cot.prima_total > 0 ? this.money((cot.comision_total / cot.prima_total) * 100) : 0;

    const req = this.db.request();
    req.input('cramo', T.Int, dto.cramo);
    req.input('cplan', T.VarChar(10), dto.cplan.trim());
    req.input('ifrecuencia', T.Char(1), 'A');
    req.input('femision', T.Date, fdesde);
    req.input('fdesde', T.Date, fdesde);
    req.input('fhasta', T.Date, ymd(hasta));
    req.input('mprimaext', T.Numeric(18, 2), cot.prima_total);
    req.input('mprima', T.Numeric(18, 2), this.money(cot.prima_total * tasa));
    req.input('ptasamon', T.Numeric(18, 6), tasa);
    req.input('msumaaseg', T.Numeric(18, 2), this.money(cot.suma_asegurada * tasa));
    req.input('msumaasegext', T.Numeric(18, 2), cot.suma_asegurada);
    req.input('pcomision', T.Numeric(18, 2), pcomision);
    req.input('mcomision', T.Numeric(18, 2), this.money(cot.comision_total * tasa));
    req.input('mcomisionext', T.Numeric(18, 2), cot.comision_total);
    req.input('xdirecob', T.VarChar(60), this.dir60(dto.direccion_riesgo));
    req.input('xdireccion', T.VarChar(60), this.dir60(dto.direccion_riesgo));
    req.input('xdescrip1', T.VarChar(250), dto.bien.slice(0, 250));
    req.input('xdescrip2', T.VarChar(250), dto.direccion_riesgo.slice(0, 250));
    req.input('xdescrip3', T.VarChar(250), cot.datos_bien?.xdescrip3 ?? null);
    req.input('xdescrip4', T.VarChar(250), cot.datos_bien?.xdescrip4 ?? null);
    if (dto.apartamento) {
      req.input('ncertificado', T.Int, dto.apartamento);
      req.input('napartamento', T.Int, dto.apartamento);
      req.input('ccerti', T.Int, dto.apartamento);
    }
    req.input('dispositivos', T.NVarChar(T.MAX), '[]');
    req.input('sustancias', T.NVarChar(T.MAX), '[]');
    req.input('equipos', T.NVarChar(T.MAX), '[]');
    req.input('coberturas', T.NVarChar(T.MAX), coberturasJson);
    this.persona(req, 'tomador', tomador, rifTomador);
    this.persona(req, 'asegurado', asegurado, rifAsegurado);
    req.input('cproductor', T.Int, dto.productor ?? 80080);
    req.input('ccanalalt', T.Int, null);
    req.input('cscanalalt', T.Int, null);
    req.input('xcanal_venta', T.VarChar(250), 'NEXUS COTIZADOR RC');
    req.input('xfuente', T.VarChar(10), 'NEXUS');
    req.input('api', T.VarChar(50), 'riesgos-generales');
    req.input('method', T.VarChar(50), 'POST');
    req.input('cusuario', T.Int, CUSUARIO_NEXUS);

    try {
      this.logger.log(`emitir: EXEC ${SP_PRE_EMISION_CONDOMINIO} modo=${dto.modo ?? 'plan'}${informada ? ` cotizador=${dto.cotizador} ncot=${dto.ncotizacion}` : ''} ramo=${dto.cramo} plan=${dto.cplan} rif=${rifAsegurado} prima=${cot.prima_total} coberturas=${cot.coberturas.length} fhasta=${ymd(hasta)}`);
      const result = await req.execute(SP_PRE_EMISION_CONDOMINIO);
      const row = (result.recordset?.[0] ?? {}) as Record<string, unknown>;
      const cnpoliza = String(row.cnpoliza ?? '').trim();
      if (!cnpoliza) throw new InternalServerErrorException('El procedimiento de emisión no retornó número de póliza.');
      const rec = await this.db.request()
        .input('cnpoliza', T.VarChar(30), cnpoliza)
        .query('SELECT TOP 1 cnrecibo FROM adrecibos WHERE cnpoliza = @cnpoliza ORDER BY crecibo ASC');
      const fanopol = hoy.getFullYear();
      const fmespol = hoy.getMonth() + 1;
      const pdfBase = this.config.get<string>('POLICY_PDF_URL') ?? this.config.get<string>('URLPoliza');
      return {
        message: 'Emisión registrada exitosamente.',
        cnpoliza,
        cnrecibo: String(rec.recordset?.[0]?.cnrecibo ?? '').trim(),
        // cpoliza como texto: NUMERIC(19,0) pasa la precisión de los números de JavaScript.
        cpoliza: row.cpoliza != null ? String(row.cpoliza) : null,
        fanopol,
        fmespol,
        urlpoliza: buildPolicyPdfUrl(pdfBase, cnpoliza, fanopol, fmespol),
        cotizacion: cot,
      };
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      const msg = parseSPError(err);
      this.logger.error(`emitir: ${msg}`);
      const duplicado = traducirDuplicadoSp(msg, dto.cramo, cplan, dto.apartamento);
      if (duplicado) throw new ConflictException(duplicado);
      throw new BadRequestException(toUserFacingError(msg));
    }
  }

  private persona(req: ReturnType<MssqlService['request']>, rol: 'tomador' | 'asegurado', p: PersonaRiesgoDto, rif: number) {
    const T = this.db.types;
    req.input(`icedula_${rol}`, T.Char(1), String(p.tipo_cedula || 'V').charAt(0).toUpperCase());
    req.input(`xrif_${rol}`, T.Numeric(12, 0), rif);
    req.input(`xnombre_${rol}`, T.VarChar(250), p.nombre.trim().toUpperCase());
    req.input(`xapellido_${rol}`, T.VarChar(250), (p.apellido ?? '').trim().toUpperCase());
    req.input(`isexo_${rol}`, T.Char(1), 'M');
    req.input(`iestado_civil_${rol}`, T.Char(1), 'S');
    req.input(`fnac_${rol}`, T.Date, '1990-01-01');
    req.input(`cestado_${rol}`, T.VarChar(100), '1');
    req.input(`cciudad_${rol}`, T.VarChar(100), '1');
    req.input(`xdireccion_${rol}`, T.VarChar(60), this.dir60(p.direccion));
    req.input(`xtelefono_${rol}`, T.VarChar(250), String(p.telefono ?? '').replace(/\D/g, '').slice(0, 20));
    req.input(`xcorreo_${rol}`, T.VarChar(250), (p.correo ?? '').trim());
  }

  private rif(raw: unknown): number {
    const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 12);
    return digits ? Number(digits) : 0;
  }

  private money(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** maclient_dir.xavecalle CHAR(60). */
  private dir60(raw: unknown): string {
    const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
    return (t || 'Caracas').slice(0, 60);
  }
}
