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

@Injectable()
export class CondominioService {
  private readonly logger = new Logger(CondominioService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

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
      const req = this.db.request();
      req.input('cramo', T.Int, dto.cramo ?? 38);
      req.input('cplan', T.VarChar(10), dto.cplan);
      req.input('msumaasegext', T.Numeric(18, 2), null);
      req.input('ifrecuencia', T.Char(1), dto.ifrecuencia);
      req.input('ptasamon', T.Numeric(18, 6), null);
      req.input('dispositivos', T.NVarChar(T.MAX), dto.dispositivos ? JSON.stringify(dto.dispositivos) : '[]');
      req.input('sustancias', T.NVarChar(T.MAX), dto.sustancias ? JSON.stringify(dto.sustancias) : '[]');
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

      // 3. Resolver tasa de cambio
      let tasa: number = dto.tasa ?? 0;
      if (!tasa) {
        if (cmoneda === 'Bs' || cmoneda === 'BS') {
          tasa = 1.0;
        } else {
          const tasaRes = await this.db.request()
            .input('cmoneda', T.Char(4), cmoneda)
            .query('SELECT ptasamon FROM mamonedas WHERE cmoneda = @cmoneda');
          tasa = tasaRes.recordset?.[0]?.ptasamon ?? 1.0;
        }
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
          dispositivos: dto.dispositivos,
          sustancias: dto.sustancias,
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
      prima = prima ?? 0.00;
      msumaasegext = msumaasegext ?? 0.00;
      msumaaseg = msumaaseg ?? (msumaasegext * tasa);
      pcomision = pcomision ?? 0.00;
      mcomision = mcomision ?? 0.00;
      mcomisionext = mcomisionext ?? 0.00;

      const req = this.db.request();

      // Bind basic fields
      req.input('cramo', T.Int, dto.cramo);
      req.input('cplan', T.VarChar(10), dto.plan);
      req.input('ifrecuencia', T.Char(1), dto.frecuencia);
      req.input('femision', T.Date, fechaEmision);
      req.input('fdesde', T.Date, fdesde);
      req.input('fhasta', T.Date, fhasta);
      req.input('mprimaext', T.Numeric(18, 2), prima);
      req.input('mprima', T.Numeric(18, 2), (prima * tasa));
      req.input('ptasamon', T.Numeric(18, 6), tasa);
      req.input('msumaaseg', T.Numeric(18, 2), msumaaseg);
      req.input('msumaasegext', T.Numeric(18, 2), msumaasegext);
      req.input('pcomision', T.Numeric(18, 2), pcomision);
      req.input('mcomision', T.Numeric(18, 2), mcomision);
      req.input('mcomisionext', T.Numeric(18, 2), mcomisionext);

      // Staging / Certificados
      req.input('xdirecob', T.VarChar(250), dto.xdirecob);
      req.input('xdireccion', T.VarChar(250), dto.xdireccion);
      req.input('xdescrip1', T.VarChar(250), dto.xdescrip1);
      req.input('xdescrip2', T.VarChar(250), dto.xdescrip2);
      req.input('xdescrip3', T.VarChar(250), dto.xdescrip3 ?? null);
      req.input('xdescrip4', T.VarChar(250), dto.xdescrip4 ?? null);

      // Arrays JSON
      req.input('dispositivos', T.NVarChar(T.MAX), dto.dispositivos ? JSON.stringify(dto.dispositivos) : '[]');
      req.input('sustancias', T.NVarChar(T.MAX), dto.sustancias ? JSON.stringify(dto.sustancias) : '[]');
      req.input('equipos', T.NVarChar(T.MAX), dto.equipos ? JSON.stringify(dto.equipos) : '[]');

      // Tomador
      req.input('icedula_tomador', T.Char(1), dto.tipo_cedula_tomador ?? 'V');
      req.input('xrif_tomador', T.Numeric(12, 0), Number(String(dto.rif_tomador).replace(/\D/g, '')));
      req.input('xnombre_tomador', T.VarChar(250), dto.nombre_tomador ?? '');
      req.input('xapellido_tomador', T.VarChar(250), dto.apellido_tomador ?? '');
      req.input('isexo_tomador', T.Char(1), dto.sexo_tomador ?? 'M');
      req.input('iestado_civil_tomador', T.Char(1), dto.estado_civil_tomador ?? 'S');
      req.input('fnac_tomador', T.Date, dto.fnac_tomador ?? '1990-01-01');
      req.input('cestado_tomador', T.VarChar(100), String(dto.estado_tomador ?? '1'));
      req.input('cciudad_tomador', T.VarChar(100), String(dto.ciudad_tomador ?? '1'));
      req.input('xdireccion_tomador', T.VarChar(1000), dto.direccion_tomador ?? '');
      req.input('xtelefono_tomador', T.VarChar(250), dto.telefono_tomador ?? '');
      req.input('xcorreo_tomador', T.VarChar(250), dto.correo_tomador ?? '');

      // Asegurado
      req.input('icedula_asegurado', T.Char(1), dto.tipo_cedula_asegurado ?? 'V');
      req.input('xrif_asegurado', T.Numeric(12, 0), Number(String(dto.rif_asegurado).replace(/\D/g, '')));
      req.input('xnombre_asegurado', T.VarChar(250), dto.nombre_asegurado ?? '');
      req.input('xapellido_asegurado', T.VarChar(250), dto.apellido_asegurado ?? '');
      req.input('isexo_asegurado', T.Char(1), dto.sexo_asegurado ?? 'M');
      req.input('iestado_civil_asegurado', T.Char(1), dto.estado_civil_asegurado ?? 'S');
      req.input('fnac_asegurado', T.Date, dto.fnac_asegurado ?? '1990-01-01');
      req.input('cestado_asegurado', T.VarChar(100), String(dto.estado_asegurado ?? '1'));
      req.input('cciudad_asegurado', T.VarChar(100), String(dto.ciudad_asegurado ?? '1'));
      req.input('xdireccion_asegurado', T.VarChar(1000), dto.direccion_asegurado ?? '');
      req.input('xtelefono_asegurado', T.VarChar(250), dto.telefono_asegurado ?? '');
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

      this.logger.log(`emitir (condominio): EXEC ${SP_PRE_EMISION_CONDOMINIO} plan=${dto.plan} RIF=${dto.rif_asegurado}`);
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
