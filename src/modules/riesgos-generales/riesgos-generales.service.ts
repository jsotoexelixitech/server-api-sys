import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { parseSPError, toUserFacingError } from '../../common/helpers/sp-error.helper';
import { buildPolicyPdfUrl } from '../../common/helpers/policy-url.helper';
import { SP_PRE_EMISION_CONDOMINIO } from '../../config/sis2000-sp.constants';
import { calcularCoberturas, esObligatoria, type CoberturaTarifa, type CotizacionCalculada } from './riesgos-generales.calculo';
import { CotizarCoberturasDto, EmitirCoberturasDto, PersonaRiesgoDto, TarifaPlanDto } from './dto/riesgos-generales.dto';

/** Usuario Sis2000 de las emisiones Nexus de riesgos generales (mismo que condominio). */
const CUSUARIO_NEXUS = 20364172;

/**
 * Riesgos generales por cobertura (cotizador RC): tarifa del plan, cotización y emisión con las coberturas
 * y sumas elegidas. La prima se calcula siempre aquí (suma × tasa de matarifa_d); el cliente solo manda
 * coberturas y sumas. La emisión usa sp_pre_emision_condominio_nexus con @coberturas, que graba cada
 * cobertura tal como se envía (sp_emision_condominio_nexus no recalcula cuando hay cotización preestablecida).
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

  async cotizar(dto: CotizarCoberturasDto): Promise<CotizacionCalculada> {
    const tarifa = await this.getTarifa(dto);
    const { cotizacion, errores } = calcularCoberturas(tarifa.coberturas, dto.coberturas);
    if (!cotizacion) throw new BadRequestException(errores.join(' '));
    return cotizacion;
  }

  async emitir(dto: EmitirCoberturasDto) {
    const cot = await this.cotizar(dto);
    const T = this.db.types;
    const hoy = new Date();
    const ymd = (d: Date) => d.toISOString().split('T')[0];
    const fdesde = ymd(hoy);
    const hasta = new Date(hoy);
    hasta.setFullYear(hasta.getFullYear() + 1);

    const tasaRes = await this.db.request()
      .input('cramo', T.Int, dto.cramo)
      .input('cplan', T.VarChar(10), dto.cplan.trim())
      .query(`SELECT m.ptasamon FROM maplanes p INNER JOIN mamonedas m ON m.cmoneda = p.cmoneda
              WHERE p.cramo = @cramo AND RTRIM(p.cplan) = @cplan`);
    const tasa = Number(tasaRes.recordset?.[0]?.ptasamon ?? 0) || 1;

    const tomador = dto.tomador;
    const asegurado = dto.asegurado ?? dto.tomador;
    const rifTomador = this.rif(tomador.rif);
    const rifAsegurado = this.rif(asegurado.rif);
    if (!rifTomador || !rifAsegurado) throw new BadRequestException('El RIF o la cédula del tomador y del asegurado son obligatorios.');
    if (dto.cramo === 38 && !dto.apartamento) {
      throw new BadRequestException('El número de apartamento es obligatorio en el ramo 38 (clave cédula + plan + unidad).');
    }

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
    req.input('xdescrip3', T.VarChar(250), null);
    req.input('xdescrip4', T.VarChar(250), null);
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
      this.logger.log(`emitir: EXEC ${SP_PRE_EMISION_CONDOMINIO} ramo=${dto.cramo} plan=${dto.cplan} rif=${rifAsegurado} prima=${cot.prima_total} coberturas=${cot.coberturas.length}`);
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
