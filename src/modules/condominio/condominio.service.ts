import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { GetPlanesCondominioDto } from './dto/get-planes-condominio.dto';
import { CotizacionCondominioDto } from './dto/cotizacion-condominio.dto';
import { CreateEmissionCondominioDto } from './dto/create-emission-condominio.dto';
import { parseSPError } from '../../common/helpers/sp-error.helper';
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
      throw new BadRequestException(msg);
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
}
