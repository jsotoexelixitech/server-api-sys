import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { GetPlanesCondominioDto } from './dto/get-planes-condominio.dto';
import { CotizacionCondominioDto } from './dto/cotizacion-condominio.dto';
import { CreateEmissionCondominioDto } from './dto/create-emission-condominio.dto';
import { GetTarificadorDto, UpdateTarificadorTasaDto } from './dto/tarificador.dto';
import { CotizacionPreestablecidaDto } from './dto/cotizacion-preestablecida.dto';
import { parseSPError, toUserFacingError } from '../../common/helpers/sp-error.helper';
import { buildPolicyPdfUrl } from '../../common/helpers/policy-url.helper';
import {
  SP_BUSCA_PLANES_CONDOMINIO,
  SP_CALCULO_COTIZACION_CONDOMINIO,
  SP_PRE_EMISION_CONDOMINIO,
} from '../../config/sis2000-sp.constants';

/** Numeric(12,0) del SP: máximo 12 dígitos enteros. */
const RIF_MAX_DIGITS = 12;
/** Numeric(18,2): máximo ~1e16 antes de overflow. */
const MONEY_MAX_ABS = 1e16 - 1;
/** SIS2000 maclient_dir.xavecalle = CHAR(60). */
const XAVECALLE_MAX = 60;

@Injectable()
export class CondominioService {
  private readonly logger = new Logger(CondominioService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  /** RIF/cédula limpio para @xrif_* NUMERIC(12,0). Evita overflow nvarchar→numeric. */
  private toRifNumeric(raw: unknown): number {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return 0;
    const clipped = digits.length > RIF_MAX_DIGITS ? digits.slice(0, RIF_MAX_DIGITS) : digits;
    const n = Number(clipped);
    return Number.isFinite(n) ? n : 0;
  }

  /** Código estado/ciudad para spCreateMaclient (@cestado/@cciudad SMALLINT). */
  private toGeoCode(raw: unknown, fallback = 1): number {
    const n = Number(String(raw ?? '').trim().replace(/\D/g, '') || fallback);
    if (!Number.isFinite(n) || n < 0 || n > 32767) return fallback;
    return Math.trunc(n);
  }

  /** Arrays JSON de IDs (dispositivos/sustancias): solo enteros 1..32767. */
  private toIdArray(arr: unknown, objectKey: 'cdisseg' | 'csustanc'): number[] {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => {
        if (typeof item === 'number') return item;
        if (item && typeof item === 'object') {
          return Number((item as Record<string, unknown>)[objectKey] ?? (item as Record<string, unknown>).id);
        }
        return Number(item);
      })
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 32767)
      .map((n) => Math.trunc(n));
  }

  /** Montos seguros para Numeric(18,2). */
  private toMoney(raw: unknown, fallback = 0): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    if (Math.abs(n) >= MONEY_MAX_ABS) return fallback;
    return Math.round(n * 100) / 100;
  }

  /**
   * Dirección para maclient_dir.xavecalle / @xdireccion CHAR(60).
   * Prefiere segmentos separados por coma para no cortar a mitad de palabra.
   */
  private toXavecalle(raw: unknown, fallback = 'Caracas'): string {
    const text = String(raw ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return fallback;
    if (text.length <= XAVECALLE_MAX) return text;
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    let acc = '';
    for (const part of parts) {
      const next = acc ? `${acc}, ${part}` : part;
      if (next.length > XAVECALLE_MAX) break;
      acc = next;
    }
    return (acc || text).slice(0, XAVECALLE_MAX).trim() || fallback;
  }

  /**
   * Equipos en el formato que espera OPENJSON del SP
   * (xdescrip, anofab, msumasetot, cantidad). Descarta shapes inválidos
   * (p.ej. {nombre,marca,serial}) que no aportan y pueden romper CAST.
   */
  private toEquiposJson(equipos: unknown): string {
    if (!Array.isArray(equipos) || !equipos.length) return '[]';
    const mapped = equipos
      .map((e) => {
        if (!e || typeof e !== 'object') return null;
        const row = e as Record<string, unknown>;
        const xdescrip = String(row.xdescrip ?? row.xDescrip ?? row.nombre ?? '').trim();
        const anofab = Number(row.anofab ?? row.anoFab);
        const msumasetotloc = Number(row.msumasetotloc ?? row.msumaSetotLoc);
        const msumasetot = Number(row.msumasetot ?? row.msumaSetot);
        const cantidad = Number(row.cantidad);
        const hasMoney =
          (Number.isFinite(msumasetotloc) && msumasetotloc > 0 && Math.abs(msumasetotloc) < MONEY_MAX_ABS) ||
          (Number.isFinite(msumasetot) && msumasetot > 0 && Math.abs(msumasetot) < MONEY_MAX_ABS);
        if (!xdescrip && !hasMoney) return null;
        return {
          xdescrip: xdescrip || 'Equipo',
          ...(Number.isFinite(anofab) && anofab > 1900 && anofab < 2100 ? { anofab: Math.trunc(anofab) } : {}),
          ...(Number.isFinite(msumasetotloc) && msumasetotloc > 0 && Math.abs(msumasetotloc) < MONEY_MAX_ABS
            ? { msumasetotloc: this.toMoney(msumasetotloc) }
            : {}),
          ...(Number.isFinite(msumasetot) && msumasetot > 0 && Math.abs(msumasetot) < MONEY_MAX_ABS
            ? { msumasetot: this.toMoney(msumasetot) }
            : {}),
          ...(Number.isFinite(cantidad) && cantidad > 0 && cantidad <= 32767
            ? { cantidad: Math.trunc(cantidad) }
            : { cantidad: 1 }),
        };
      })
      .filter(Boolean);
    return JSON.stringify(mapped);
  }

  async getPlanes(dto: GetPlanesCondominioDto) {
    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('cramo', T.Int, dto.cramo ?? 38);
      req.input('cplan', T.Char(6), dto.cplan ?? null);

      const result = await req.execute(SP_BUSCA_PLANES_CONDOMINIO);
      const rawPlanes = result.recordsets?.[0] ?? [];
      const rawCoberturas = result.recordsets?.[1] ?? [];
      const dispositivos = result.recordsets?.[2] ?? [];
      const sustancias = result.recordsets?.[3] ?? [];

      const planes = rawPlanes.map(p => {
        const planCode = String(p.cplan).trim();
        return {
          cramo: p.cramo,
          cplan: planCode,
          xplan: String(p.xplan ?? '').trim(),
          xplan_c: String(p.xplan_c ?? '').trim(),
          cmoneda: String(p.cmoneda ?? '').trim(),
          iestado: String(p.iestado ?? '').trim(),
          coberturas: rawCoberturas
            .filter(c => String(c.cplan).trim() === planCode)
            .map(c => ({
              ccober: String(c.ccober).trim(),
              xcobertura: String(c.xcobertura ?? '').trim(),
              ctarifa: String(c.ctarifa).trim(),
              xtarifa: String(c.xtarifa ?? '').trim(),
              msumamin: c.msumamin,
              msumamax: c.msumamax,
              pprima: c.pprima,
              mprima: c.mprima,
              iestado: String(c.iestado ?? '').trim(),
            })),
        };
      });

      return {
        planes,
        dispositivos,
        sustancias,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPlanes: ${msg}`);
      throw new InternalServerErrorException(`Error al obtener planes: ${msg}`);
    }
  }

  async cotizar(dto: CotizacionCondominioDto) {
    try {
      const T = this.db.types;
      const dispositivos = this.toIdArray(dto.dispositivos, 'cdisseg');
      const sustancias = this.toIdArray(dto.sustancias, 'csustanc');
      const req = this.db.request();
      req.input('cramo', T.Int, dto.cramo ?? 38);
      req.input('cplan', T.VarChar(10), dto.cplan);
      req.input('msumaasegext', T.Numeric(18, 2), null);
      req.input('ifrecuencia', T.Char(1), dto.ifrecuencia);
      req.input('ptasamon', T.Numeric(18, 6), null);
      req.input('dispositivos', T.NVarChar(T.MAX), JSON.stringify(dispositivos));
      req.input('sustancias', T.NVarChar(T.MAX), JSON.stringify(sustancias));
      req.input('is_emision', T.Bit, false);

      const result = await req.execute(SP_CALCULO_COTIZACION_CONDOMINIO);
      return {
        coberturas: result.recordsets?.[0] ?? [],
        totales: result.recordsets?.[1]?.[0] ?? null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`cotizar: ${msg}`);
      throw new BadRequestException(`Error al cotizar: ${msg}`);
    }
  }

  async emitir(dto: CreateEmissionCondominioDto) {
    try {
      const T = this.db.types;

      // 1. Resolver fechas por defecto
      const todayStr = new Date().toISOString().split('T')[0];
      const fechaEmision = dto.fecha_emision || todayStr;
      const fdesde = dto.fdesde || fechaEmision;
      
      let fhasta = dto.fhasta;
      if (!fhasta) {
        const d = new Date(fdesde);
        d.setFullYear(d.getFullYear() + 1);
        fhasta = d.toISOString().split('T')[0];
      }

      // 2. Resolver moneda del plan
      const planRes = await this.db.request()
        .input('cramo', T.Int, dto.cramo)
        .input('cplan', T.Char(6), dto.plan)
        .query('SELECT cmoneda FROM maplanes WHERE cramo = @cramo AND cplan = @cplan');
      const cmoneda = dto.cmoneda ?? planRes.recordset?.[0]?.cmoneda?.trim() ?? '$';

      // 3. Resolver tasa de cambio.
      // El portal suele mandar tasa=1 como placeholder: para planes en $ se ignora y se usa BCV.
      const monedaNorm = String(cmoneda).trim();
      let tasa: number = Number(dto.tasa ?? 0);
      const tasaEsPlaceholder =
        !Number.isFinite(tasa) || tasa <= 0 || (monedaNorm === '$' && tasa === 1);
      if (tasaEsPlaceholder) {
        if (monedaNorm === 'Bs' || monedaNorm === 'BS') {
          tasa = 1.0;
        } else {
          const tasaRes = await this.db.request()
            .input('cmoneda', T.Char(4), cmoneda)
            .query('SELECT ptasamon FROM mamonedas WHERE cmoneda = @cmoneda');
          tasa = Number(tasaRes.recordset?.[0]?.ptasamon ?? 0) || 1.0;
        }
      }

      const dispositivos = this.toIdArray(dto.dispositivos, 'cdisseg');
      const sustancias = this.toIdArray(dto.sustancias, 'csustanc');
      const equiposJson = this.toEquiposJson(dto.equipos);
      const rifTomador = this.toRifNumeric(dto.rif_tomador);
      const rifAsegurado = this.toRifNumeric(dto.rif_asegurado);
      if (!rifTomador || !rifAsegurado) {
        throw new BadRequestException(
          'El RIF/Cédula del tomador y del asegurado son obligatorios (solo dígitos, máx. 12).',
        );
      }

      // 4. Cotización interna si faltan campos calculados
      let prima = dto.prima;
      let msumaasegext = dto.msumaasegext;
      let msumaaseg = dto.msumaaseg;
      let pcomision = dto.pcomision;
      let mcomision = dto.mcomision;
      let mcomisionext = dto.mcomisionext;

      // Cotización preestablecida (producto/enlace de autogestión): se valida y se usa tal cual, sin recalcular.
      let coberturasJson: string | null = null;
      if (dto.cotizacion) {
        await this.validarCotizacionPreestablecida(dto.cramo, dto.cotizacion, dispositivos, sustancias);
        const cot = dto.cotizacion;
        const comisionTotal = cot.coberturas.reduce((acc, c) => acc + (c.comision ?? 0), 0);
        prima = cot.prima_total;
        msumaasegext = cot.suma_asegurada;
        mcomisionext = this.toMoney(comisionTotal, 0);
        mcomision = this.toMoney(comisionTotal * tasa, 0);
        pcomision = cot.prima_total > 0 ? this.toMoney((comisionTotal / cot.prima_total) * 100, 0) : 0;
        coberturasJson = JSON.stringify(
          cot.coberturas.map((c) => ({
            ccober: c.ccober.trim(),
            ctarifa: c.ctarifa.trim(),
            msumaasegext: c.suma_asegurada,
            mprimabrutaext: c.prima_bruta,
            mdescuentoext: c.descuento,
            mrecargoext: c.recargo,
            mprimaext: c.prima,
            pcomision: c.pcomision ?? 0,
            mcomisionext: c.comision ?? 0,
          })),
        );
      }

      if (prima === undefined || msumaasegext === undefined || mcomisionext === undefined) {
        const cotResult = await this.cotizar({
          cramo: dto.cramo,
          cplan: dto.plan,
          ifrecuencia: dto.frecuencia,
          dispositivos,
          sustancias,
        });
        const totals = cotResult.totales;
        if (totals) {
          if (prima === undefined) prima = totals.mprimaext;
          if (msumaasegext === undefined) msumaasegext = totals.msumaasegext;
          if (msumaaseg === undefined) msumaaseg = totals.msumaaseg;
          if (mcomisionext === undefined) mcomisionext = totals.mcomisionext;
          if (mcomision === undefined) mcomision = totals.mcomision;
          if (pcomision === undefined) {
            pcomision = totals.mprimaext > 0 ? (totals.mcomisionext / totals.mprimaext) * 100 : 0.0;
          }
        }
      }

      // Valores por defecto finales si no se pudo cotizar ni resolver
      prima = this.toMoney(prima, 0);
      msumaasegext = this.toMoney(msumaasegext, 0);
      // Si msumaaseg vino igual a msumaasegext (portal en USD), convertir con tasa real.
      if (
        msumaaseg == null ||
        !Number.isFinite(Number(msumaaseg)) ||
        (msumaasegext > 0 && Number(msumaaseg) === msumaasegext && tasa > 1)
      ) {
        msumaaseg = this.toMoney(msumaasegext * tasa, 0);
      } else {
        msumaaseg = this.toMoney(msumaaseg, this.toMoney(msumaasegext * tasa, 0));
      }
      pcomision = this.toMoney(pcomision, 0);
      mcomision = this.toMoney(mcomision, 0);
      mcomisionext = this.toMoney(mcomisionext, 0);
      const mprima = this.toMoney(prima * tasa, 0);

      const cestadoTomador = String(this.toGeoCode(dto.estado_tomador));
      const cciudadTomador = String(this.toGeoCode(dto.ciudad_tomador));
      const cestadoAsegurado = String(this.toGeoCode(dto.estado_asegurado));
      const cciudadAsegurado = String(this.toGeoCode(dto.ciudad_asegurado));
      const telTomador = String(dto.telefono_tomador ?? '').replace(/\D/g, '').slice(0, 20);
      const telAsegurado = String(dto.telefono_asegurado ?? '').replace(/\D/g, '').slice(0, 20);

      const req = this.db.request();

      // Bind basic fields
      req.input('cramo', T.Int, dto.cramo);
      req.input('cplan', T.VarChar(10), dto.plan);
      req.input('ifrecuencia', T.Char(1), dto.frecuencia);
      req.input('femision', T.Date, fechaEmision);
      req.input('fdesde', T.Date, fdesde);
      req.input('fhasta', T.Date, fhasta);
      req.input('mprimaext', T.Numeric(18, 2), prima);
      req.input('mprima', T.Numeric(18, 2), mprima);
      req.input('ptasamon', T.Numeric(18, 6), tasa);
      req.input('msumaaseg', T.Numeric(18, 2), msumaaseg);
      req.input('msumaasegext', T.Numeric(18, 2), msumaasegext);
      req.input('pcomision', T.Numeric(18, 2), pcomision);
      req.input('mcomision', T.Numeric(18, 2), mcomision);
      req.input('mcomisionext', T.Numeric(18, 2), mcomisionext);

      // Staging / Certificados — xdireccion alimenta maclient_dir.xavecalle CHAR(60)
      req.input('xdirecob', T.VarChar(60), this.toXavecalle(dto.xdirecob));
      req.input('xdireccion', T.VarChar(60), this.toXavecalle(dto.xdireccion));
      req.input('xdescrip1', T.VarChar(250), String(dto.xdescrip1 ?? '').slice(0, 250));
      req.input('xdescrip2', T.VarChar(250), String(dto.xdescrip2 ?? '').slice(0, 250));
      req.input('xdescrip3', T.VarChar(250), dto.xdescrip3 != null ? String(dto.xdescrip3).slice(0, 250) : null);
      req.input('xdescrip4', T.VarChar(250), dto.xdescrip4 != null ? String(dto.xdescrip4).slice(0, 250) : null);

      // Arrays JSON (IDs escalares — el SP hace OPENJSON … SMALLINT '$')
      req.input('dispositivos', T.NVarChar(T.MAX), JSON.stringify(dispositivos));
      req.input('sustancias', T.NVarChar(T.MAX), JSON.stringify(sustancias));
      req.input('equipos', T.NVarChar(T.MAX), equiposJson);
      if (coberturasJson) req.input('coberturas', T.NVarChar(T.MAX), coberturasJson);

      // Tomador
      req.input('icedula_tomador', T.Char(1), dto.tipo_cedula_tomador ?? 'V');
      req.input('xrif_tomador', T.Numeric(12, 0), rifTomador);
      req.input('xnombre_tomador', T.VarChar(250), dto.nombre_tomador ?? '');
      req.input('xapellido_tomador', T.VarChar(250), dto.apellido_tomador ?? '');
      req.input('isexo_tomador', T.Char(1), dto.sexo_tomador ?? 'M');
      req.input('iestado_civil_tomador', T.Char(1), dto.estado_civil_tomador ?? 'S');
      req.input('fnac_tomador', T.Date, dto.fnac_tomador ?? '1990-01-01');
      req.input('cestado_tomador', T.VarChar(100), cestadoTomador);
      req.input('cciudad_tomador', T.VarChar(100), cciudadTomador);
      req.input('xdireccion_tomador', T.VarChar(60), this.toXavecalle(dto.direccion_tomador));
      req.input('xtelefono_tomador', T.VarChar(250), telTomador);
      req.input('xcorreo_tomador', T.VarChar(250), dto.correo_tomador ?? '');

      // Asegurado
      req.input('icedula_asegurado', T.Char(1), dto.tipo_cedula_asegurado ?? 'V');
      req.input('xrif_asegurado', T.Numeric(12, 0), rifAsegurado);
      req.input('xnombre_asegurado', T.VarChar(250), dto.nombre_asegurado ?? '');
      req.input('xapellido_asegurado', T.VarChar(250), dto.apellido_asegurado ?? '');
      req.input('isexo_asegurado', T.Char(1), dto.sexo_asegurado ?? 'M');
      req.input('iestado_civil_asegurado', T.Char(1), dto.estado_civil_asegurado ?? 'S');
      req.input('fnac_asegurado', T.Date, dto.fnac_asegurado ?? '1990-01-01');
      req.input('cestado_asegurado', T.VarChar(100), cestadoAsegurado);
      req.input('cciudad_asegurado', T.VarChar(100), cciudadAsegurado);
      req.input('xdireccion_asegurado', T.VarChar(60), this.toXavecalle(dto.direccion_asegurado));
      req.input('xtelefono_asegurado', T.VarChar(250), telAsegurado);
      req.input('xcorreo_asegurado', T.VarChar(250), dto.correo_asegurado ?? '');

      // Canal
      req.input('cproductor', T.Int, dto.productor ?? 80080);
      req.input('ccanalalt', T.Int, dto.ccanalalt ?? null);
      req.input('cscanalalt', T.Int, dto.cscanalalt ?? null);
      req.input('xcanal_venta', T.VarChar(250), dto.xcanal_venta ?? 'NEXUS');

      req.input('xfuente', T.VarChar(10), 'NEXUS');
      req.input('api', T.VarChar(50), 'api-middleware');
      req.input('method', T.VarChar(50), 'POST');
      req.input('cusuario', T.Int, 20364172);

      this.logger.log(
        `emitir (condominio): EXEC ${SP_PRE_EMISION_CONDOMINIO} plan=${dto.plan} RIF=${rifAsegurado} tasa=${tasa} prima=${prima} msumaext=${msumaasegext}`,
      );
      const result = await req.execute(SP_PRE_EMISION_CONDOMINIO);
      const row = result.recordset?.[0] ?? {};
      
      if (!row['cnpoliza']) {
        throw new InternalServerErrorException('El procedimiento de emisión no retornó número de póliza.');
      }

      let cnrecibo = '';
      if (row['cnpoliza']) {
        const recRes = await this.db.request()
          .input('cnpoliza', T.VarChar(30), String(row['cnpoliza']).trim())
          .query('SELECT TOP 1 cnrecibo FROM adrecibos WHERE cnpoliza = @cnpoliza ORDER BY crecibo ASC');
        cnrecibo = recRes.recordset?.[0]?.cnrecibo?.trim() ?? '';
      }

      const fanopol = new Date(fdesde).getFullYear();
      const fmespol = new Date(fdesde).getMonth() + 1;
      const pdfBase = this.config.get<string>('POLICY_PDF_URL') ?? this.config.get<string>('URLPoliza');
      const urlpoliza = buildPolicyPdfUrl(pdfBase, String(row['cnpoliza']).trim(), fanopol, fmespol);

      return {
        message: 'Emisión registrada exitosamente.',
        cnpoliza: String(row['cnpoliza']).trim(),
        cnrecibo: cnrecibo,
        cpoliza: row['cpoliza'],
        cproces: row['cproces'],
        iestado: row['iestado'],
        xestado: row['xestado'],
        fanopol,
        fmespol,
        urlpoliza,
      };
    } catch (err) {
      const msg = parseSPError(err);
      this.logger.error(`emitir (condominio): ${msg}`);
      throw new BadRequestException(toUserFacingError(msg));
    }
  }

  /**
   * Valida que una cotización preestablecida cuadre con las tarifas del Core:
   * cobertura vigente en matarifa_d, prima = suma × pprima / 100, descuentos (madisseg), recargos (masustac),
   * comisión (maarancel) y totales. Evita que un enlace externo emita con primas alteradas.
   */
  private async validarCotizacionPreestablecida(
    cramo: number,
    cot: CotizacionPreestablecidaDto,
    dispositivos: number[],
    sustancias: number[],
  ) {
    const TOL = 0.02;
    const near = (a: number, b: number) => Math.abs(Number(a) - Number(b)) <= TOL;
    const errors: string[] = [];
    const T = this.db.types;

    const tasas = await this.getTarificadorTasas({ cramo } as GetTarificadorDto);
    const porCob = new Map(tasas.tasas.map((t) => [`${t.ccober}|${t.ctarifa}`, t]));

    const descRes = dispositivos.length
      ? await this.db.request().input('cramo', T.Int, cramo)
          .query(`SELECT ISNULL(SUM(pdisseg), 0) AS pct FROM madisseg WHERE cramo = @cramo AND cdisseg IN (${dispositivos.map(Number).join(',')})`)
      : null;
    const recRes = sustancias.length
      ? await this.db.request().input('cramo', T.Int, cramo)
          .query(`SELECT ISNULL(SUM(porcenta), 0) AS pct FROM masustac WHERE cramo = @cramo AND csustanc IN (${sustancias.map(Number).join(',')})`)
      : null;
    const descPct = Number(descRes?.recordset?.[0]?.pct ?? 0);
    const recPct = Number(recRes?.recordset?.[0]?.pct ?? 0);
    if (!near(cot.descuento_pct ?? 0, descPct)) errors.push(`descuento_pct (${cot.descuento_pct ?? 0}) no coincide con los dispositivos (${descPct}).`);
    if (!near(cot.recargo_pct ?? 0, recPct)) errors.push(`recargo_pct (${cot.recargo_pct ?? 0}) no coincide con las sustancias (${recPct}).`);

    let sumaPrimas = 0;
    let sumaBasica: number | null = null;
    for (const c of cot.coberturas) {
      const key = `${c.ccober.trim()}|${c.ctarifa.trim()}`;
      const t = porCob.get(key);
      if (!t) {
        errors.push(`La cobertura ${key} no tiene tarifa vigente en el Core.`);
        continue;
      }
      if (c.ccober.trim() === '1') sumaBasica = c.suma_asegurada;
      const bruta = (c.suma_asegurada * t.pprima) / 100;
      const desc = (c.prima_bruta * descPct) / 100;
      const rec = (c.prima_bruta * recPct) / 100;
      if (!near(c.prima_bruta, bruta)) errors.push(`Cobertura ${key}: prima bruta ${c.prima_bruta} no coincide con suma × tasa (${bruta.toFixed(2)}).`);
      if (!near(c.descuento, desc)) errors.push(`Cobertura ${key}: descuento ${c.descuento} no coincide (${desc.toFixed(2)}).`);
      if (!near(c.recargo, rec)) errors.push(`Cobertura ${key}: recargo ${c.recargo} no coincide (${rec.toFixed(2)}).`);
      if (!near(c.prima, c.prima_bruta - c.descuento + c.recargo)) errors.push(`Cobertura ${key}: prima neta no cuadra con bruta - descuento + recargo.`);
      const pcom = t.pcomision ?? 0;
      if (!near(c.pcomision ?? 0, pcom)) errors.push(`Cobertura ${key}: pcomision ${c.pcomision ?? 0} no coincide con el Core (${pcom}).`);
      if (!near(c.comision ?? 0, (c.prima * pcom) / 100)) errors.push(`Cobertura ${key}: comisión no cuadra con prima × pcomision.`);
      sumaPrimas += c.prima;
    }
    if (sumaBasica === null) errors.push('La cotización debe incluir la cobertura básica (ccober 1).');
    else if (!near(sumaBasica, cot.suma_asegurada)) errors.push('La suma asegurada de la cobertura básica no coincide con suma_asegurada.');
    if (!near(sumaPrimas, cot.prima_total)) errors.push(`prima_total (${cot.prima_total}) no coincide con la suma de primas (${sumaPrimas.toFixed(2)}).`);

    if (errors.length) {
      throw new BadRequestException(`Cotización preestablecida inválida: ${errors.join(' ')}`);
    }
  }

  async getFrecuencias() {
    return [
      { codigo: 'A', descripcion: 'Anual', cuotas: 1 },
      { codigo: 'S', descripcion: 'Semestral', cuotas: 2 },
      { codigo: 'T', descripcion: 'Trimestral', cuotas: 4 },
      { codigo: 'M', descripcion: 'Mensual', cuotas: 12 },
      { codigo: 'E', descripcion: 'Pago Único / Especial', cuotas: 1 },
    ];
  }

  async getDispositivos(cramo: number) {
    const T = this.db.types;
    const res = await this.db.request()
      .input('cramo', T.Int, cramo)
      .query('SELECT cdisseg, xdisseg, pdisseg FROM madisseg WHERE cramo = @cramo');
    return res.recordset;
  }

  async getSustancias(cramo: number) {
    const T = this.db.types;
    const res = await this.db.request()
      .input('cramo', T.Int, cramo)
      .query('SELECT csustanc, xsustanc, porcenta FROM masustac WHERE cramo = @cramo');
    return res.recordset;
  }

  /**
   * Tarifario vigente (maplantar) de un ramo: coberturas, % sobre la suma asegurada del plan y tasas.
   * La suma asegurada del plan es la de la cobertura básica (ccober = '1').
   */
  async getTarificador(dto: GetTarificadorDto) {
    const T = this.db.types;
    const req = this.db.request();
    req.input('cramo', T.Int, dto.cramo);
    req.input('cplan', T.Char(6), dto.cplan ?? null);
    const result = await req.query(`
      SELECT RTRIM(p.cplan) AS cplan, RTRIM(p.xplan) AS xplan, RTRIM(pt.ccober) AS ccober,
             RTRIM(c.xdescripcion_l) AS xcobertura, RTRIM(pt.ctarifa) AS ctarifa,
             pt.msumamin, pt.msumamax, pt.pprima, pt.mprima
      FROM maplantar pt
      INNER JOIN maplanes p ON p.cramo = pt.cramo AND p.cplan = pt.cplan AND p.iestado = 'V'
      INNER JOIN macoberturas c ON c.cramo = pt.cramo AND c.ccobertura = pt.ccober
      WHERE pt.cramo = @cramo AND pt.iestado = 'V'
        AND (@cplan IS NULL OR RTRIM(pt.cplan) = RTRIM(@cplan))
      ORDER BY p.cplan, CASE WHEN RTRIM(pt.ccober) = '1' THEN 0 ELSE 1 END, TRY_CAST(RTRIM(pt.ccober) AS INT), pt.ccober
    `);

    const planes = new Map<string, any>();
    for (const r of result.recordset) {
      let plan = planes.get(r.cplan);
      if (!plan) {
        plan = { cplan: r.cplan, xplan: r.xplan, suma_asegurada: 0, coberturas: [] };
        planes.set(r.cplan, plan);
      }
      if (r.ccober === '1') plan.suma_asegurada = Number(r.msumamax) || 0;
      plan.coberturas.push({
        ccober: r.ccober,
        xcobertura: r.xcobertura,
        ctarifa: r.ctarifa,
        msumamin: Number(r.msumamin),
        msumamax: Number(r.msumamax),
        pprima: Number(r.pprima),
        mprima: Number(r.mprima),
      });
    }
    for (const plan of planes.values()) {
      for (const c of plan.coberturas) {
        c.porcentaje_sa = plan.suma_asegurada > 0
          ? Number(((c.msumamax / plan.suma_asegurada) * 100).toFixed(4))
          : null;
      }
    }
    return { cramo: dto.cramo, planes: [...planes.values()] };
  }

  /** Tasas vigentes por cobertura del ramo (matarifa_d) con la última modificación registrada. */
  async getTarificadorTasas(dto: GetTarificadorDto) {
    const T = this.db.types;
    const result = await this.db
      .request()
      .input('cramo', T.Int, dto.cramo)
      .query(`
        SELECT RTRIM(d.ccober) AS ccober, RTRIM(d.ctarifa) AS ctarifa, RTRIM(c.xdescripcion_l) AS xcobertura,
               d.pprima, d.fultmod, d.cusuariomod, ISNULL(ara.pcomision, 0) AS pcomision
        FROM matarifa_d d
        INNER JOIN macoberturas c ON c.cramo = d.cramo AND c.ccobertura = d.ccober
        LEFT JOIN maarancel ara ON ara.cramo = d.cramo AND ara.iestado = 'V' AND ara.ctarifa = d.ctarifa
        WHERE d.cramo = @cramo AND d.iestado = 'V'
          AND d.fdesde <= GETDATE() AND (d.fhasta IS NULL OR d.fhasta >= GETDATE())
        ORDER BY TRY_CAST(RTRIM(d.ccober) AS INT), d.ccober
      `);
    return {
      cramo: dto.cramo,
      tasas: result.recordset.map((r) => ({
        ccober: r.ccober,
        ctarifa: r.ctarifa,
        xcobertura: r.xcobertura,
        pprima: Number(r.pprima),
        pcomision: Number(r.pcomision),
        fultmod: r.fultmod,
        cusuariomod: r.cusuariomod == null ? null : Number(r.cusuariomod),
      })),
    };
  }

  /** Replica la tasa (pprima) de una cobertura en matarifa_d dejando constancia del usuario que la modificó. */
  async updateTarificadorTasa(dto: UpdateTarificadorTasaDto) {
    const T = this.db.types;
    const keyReq = () =>
      this.db
        .request()
        .input('cramo', T.Int, dto.cramo)
        .input('ccober', T.Char(4), dto.ccober)
        .input('ctarifa', T.Char(4), dto.ctarifa);
    const where = `cramo = @cramo AND RTRIM(ccober) = RTRIM(@ccober) AND RTRIM(ctarifa) = RTRIM(@ctarifa)
                   AND iestado = 'V' AND fdesde <= GETDATE() AND (fhasta IS NULL OR fhasta >= GETDATE())`;

    const current = await keyReq().query(`SELECT pprima, fultmod, cusuariomod FROM matarifa_d WHERE ${where}`);
    if (current.recordset.length === 0) {
      throw new BadRequestException('La cobertura no tiene una tarifa vigente en el Core (matarifa_d).');
    }
    if (current.recordset.length > 1) {
      throw new ConflictException('La cobertura tiene más de una tarifa vigente en el Core; corrígelo antes de replicar.');
    }
    const before = current.recordset[0];

    const upd = await keyReq()
      .input('pprima', T.Numeric(18, 6), dto.pprima)
      .input('cusuario', T.Numeric(18, 0), dto.cusuario)
      .query(`UPDATE matarifa_d SET pprima = @pprima, fultmod = GETDATE(), cusuariomod = @cusuario,
                     cprog = 'NEXUS_TARIFICADOR' WHERE ${where}`);
    if ((upd.rowsAffected?.[0] ?? 0) !== 1) {
      throw new ConflictException('No se actualizó exactamente un registro; el cambio no se aplicó.');
    }
    this.logger.warn(
      `tarificador: ramo=${dto.cramo} cober=${dto.ccober} pprima ${before.pprima} -> ${dto.pprima} usuario=${dto.cusuario} (${dto.xusuario ?? 's/n'})`,
    );
    return { before: { pprima: Number(before.pprima) }, after: { pprima: dto.pprima, cusuariomod: dto.cusuario } };
  }
}
