import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { SP_GET_COVERAGE_CLIENT_NEXUS, SP_VALIDA_SINIESTRO_NEXUS } from '../../config/sis2000-sp.constants';
import { SearchCoveragesDto } from './dto/search-coverages.dto';
import { SearchVehiclePoliciesDto } from './dto/search-vehicle-policies.dto';
import { SearchTitularContactoDto } from './dto/search-titular-contacto.dto';
import { ValidateSiniestroDto } from './dto/validate-siniestro.dto';
import { buildCorreoEmisionQuery, buildPolizaYCorreoMaestroQuery, type TitularContactoSql } from './titular-contacto';
import {
  buildCoberturasQuery,
  buildVehiclePolicyQuery,
  validarCriterios,
  type SqlParam,
} from './vehicle-policy-search';

export interface ClientData {
  client: Record<string, unknown>[];
  clientTel: Record<string, unknown>[];
  clientCorreo: Record<string, unknown>[];
  clientDir: Record<string, unknown>[];
  clientAtr: Record<string, unknown>[];
}

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(private readonly db: MssqlService) {}

  // ── GET /api/v1/client/search/:cci_rif ───────────────────────────────────

  async searchClient(cci_rif: string): Promise<ClientData> {
    try {
      const T = this.db.types;

      const clientReq = this.db.request();
      clientReq.input('cci_rif', T.VarChar(20), cci_rif);
      const clientResult = await clientReq.query(`
        SELECT
          cci_rif,
          TRIM(cid)           AS cid,
          TRIM(ipersona)      AS ipersona,
          TRIM(xnombre)       AS xnombre,
          TRIM(xapellido)     AS xapellido,
          TRIM(xcliente)      AS xcliente,
          isexo,
          iestado_civil,
          FORMAT(fnacimiento, 'dd-MM-yyyy') AS fnacimiento,
          iestado
        FROM maclient
        WHERE cci_rif = @cci_rif
      `);

      const telReq = this.db.request();
      telReq.input('cci_rif', T.VarChar(20), cci_rif);
      const telResult = await telReq.query(`
        SELECT TRIM(xtelefono) AS xtelefono FROM maclient_tel WHERE cci_rif = @cci_rif
      `);

      const dirReq = this.db.request();
      dirReq.input('cci_rif', T.VarChar(20), cci_rif);
      const dirResult = await dirReq.query(`
        SELECT cpais, cestado, cciudad, RTRIM(xavecalle) AS xavecalle, RTRIM(czonapos) AS czonapos
        FROM maclient_dir WHERE cci_rif = @cci_rif
      `);

      const correoReq = this.db.request();
      correoReq.input('cci_rif', T.VarChar(20), cci_rif);
      const correoResult = await correoReq.query(`
        SELECT cci_rif, RTRIM(xcorreo) AS xcorreo FROM maclient_correo WHERE cci_rif = @cci_rif
      `);

      const atrReq = this.db.request();
      atrReq.input('cci_rif', T.VarChar(20), cci_rif);
      const atrResult = await atrReq.query(`
        SELECT cci_rif FROM maclient_atr WHERE cci_rif = @cci_rif
      `);

      return {
        client:       clientResult.recordset ?? [],
        clientTel:    telResult.recordset ?? [],
        clientCorreo: correoResult.recordset ?? [],
        clientDir:    dirResult.recordset ?? [],
        clientAtr:    atrResult.recordset ?? [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchClient: ${msg}`);
      throw new InternalServerErrorException('Error al buscar cliente.');
    }
  }

  // ── GET /api/v1/client/search/policies/:cci_rif ──────────────────────────

  async searchPoliciesByClient(cci_rif: string): Promise<Record<string, unknown>[]> {
    try {
      const req = this.db.request();
      const T = this.db.types;
      req.input('casegurado', T.Int, Number(cci_rif));
      const result = await req.execute('spGetPolizasAsegurado');
      return result.recordset ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchPoliciesByClient: ${msg}`);
      throw new InternalServerErrorException('Error al buscar pólizas del cliente.');
    }
  }

  // ── POST /api/v1/client/search/coverages ─────────────────────────────────

  async searchCoverages(
    body: SearchCoveragesDto,
  ): Promise<{ poliza: Record<string, unknown>[]; coberturas: Record<string, unknown>[] }> {
    try {
      const req = this.db.request();
      const T = this.db.types;
      req.input('cpoliza', T.VarChar(19), body.cpoliza); // texto: el driver pierde precisión con numeric de 19 dígitos; el SP lo compara exacto
      req.input('fanopol', T.Int, body.fanopol);
      req.input('fmespol', T.Int, body.fmespol);
      const result = await req.execute(SP_GET_COVERAGE_CLIENT_NEXUS);
      return {
        poliza: (result.recordsets?.[0] as Record<string, unknown>[]) ?? [],
        coberturas: (result.recordsets?.[1] as Record<string, unknown>[]) ?? [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchCoverages: ${msg}`);
      throw new InternalServerErrorException('Error al buscar coberturas de la póliza.');
    }
  }

  // ── GET /api/v1/client/search/vehicle-policies ───────────────────────────

  private bindParams(req: ReturnType<MssqlService['request']>, params: SqlParam[]): void {
    const T = this.db.types;
    for (const p of params) {
      if (p.type === 'varchar') req.input(p.name, T.VarChar(p.length), p.value);
      else if (p.type === 'numeric') req.input(p.name, T.Numeric(18, 0), p.value);
      else req.input(p.name, T.Int, p.value);
    }
  }

  async searchVehiclePolicies(filters: SearchVehiclePoliciesDto) {
    const error = validarCriterios(filters);
    if (error) throw new BadRequestException(error);

    try {
      const built = buildVehiclePolicyQuery(filters);
      const req = this.db.request();
      this.bindParams(req, built.params);
      const result = await req.query(built.sql);

      const filas = (result.recordset ?? []) as Record<string, unknown>[];
      const hasMore = filas.length > built.limit;
      const pagina = filas.slice(0, built.limit);

      const coberturasPorPlan = new Map<string, Record<string, unknown>[]>();
      if (pagina.length > 0) {
        const planes = new Map<string, { cramo: number; cplan: string }>();
        for (const f of pagina) {
          const cplan = String(f.cplan ?? '').trim();
          if (cplan) planes.set(`${f.cramo}|${cplan}`, { cramo: Number(f.cramo), cplan });
        }
        if (planes.size > 0) {
          const cob = buildCoberturasQuery([...planes.values()]);
          const cobReq = this.db.request();
          this.bindParams(cobReq, cob.params);
          const cobRes = await cobReq.query(cob.sql);
          for (const c of (cobRes.recordset ?? []) as Record<string, unknown>[]) {
            const key = `${c.cramo}|${c.cplan}`;
            const lista = coberturasPorPlan.get(key) ?? [];
            lista.push({ ccobertura: c.ccobertura, xcobertura: c.xcobertura, msumamax: c.msumamax });
            coberturasPorPlan.set(key, lista);
          }
        }
      }

      const items = pagina.map((f) => ({
        poliza: {
          cpoliza: f.cpoliza,
          fanopol: f.fanopol,
          fmespol: f.fmespol,
          cnpoliza: f.cnpoliza,
          cramo: f.cramo,
          xramo: f.xramo,
          cplan: f.cplan,
          istatpol: f.istatpol,
          desde: f.poliza_desde,
          hasta: f.poliza_hasta,
          cproductor: f.cproductor,
          cmoneda: f.cmoneda,
          ccerti: f.ccerti,
          istatcer: f.istatcer,
          cert_desde: f.cert_desde,
          cert_hasta: f.cert_hasta,
        },
        vehiculo: {
          xplaca: f.xplaca,
          xsercar: f.xsercar,
          xsermot: f.xsermot,
          xcolor: f.xcolor,
          cano: f.cano,
          cmarca: f.cmarca,
          xmarca: f.xmarca,
          cmodelo: f.cmodelo,
          cversion: f.cversion,
          mvalor: f.mvalor,
          qpuestos: f.qpuestos,
        },
        asegurado: { casegurado: f.casegurado, xasegurado: f.xasegurado, cid: f.cid_asegurado },
        tenedor: { ctenedor: f.ctenedor },
        coberturas: coberturasPorPlan.get(`${f.cramo}|${String(f.cplan ?? '').trim()}`) ?? [],
      }));

      return { items, limit: built.limit, offset: built.offset, hasMore };
    } catch (err) {
      if (err instanceof RangeError) throw new BadRequestException(err.message);
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchVehiclePolicies: ${msg}`);
      throw new InternalServerErrorException('Error al buscar pólizas por vehículo.');
    }
  }

  // ── GET /api/v1/client/roles ─────────────────────────────────────────────

  /** Roles activos de SysIP (`serol`) con su departamento. Catálogo: no contiene datos personales. */
  async listRoles(): Promise<
    { crol: number; xrol: string; cdepartamento: number; xdepartamento: string }[]
  > {
    try {
      const result = await this.db.request().query(`
        SELECT
          r.crol,
          RTRIM(r.xrol)                  AS xrol,
          r.cdepartamento,
          RTRIM(d.xdepartamento)         AS xdepartamento
        FROM serol r
        LEFT JOIN sedepartamento d ON d.cdepartamento = r.cdepartamento
        WHERE RTRIM(r.istatus) = 'V'
        ORDER BY d.xdepartamento, r.cnivel, r.crol
      `);
      return (result.recordset ?? []) as {
        crol: number;
        xrol: string;
        cdepartamento: number;
        xdepartamento: string;
      }[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`listRoles: ${msg}`);
      throw new InternalServerErrorException('Error al listar los roles.');
    }
  }

  // ── GET /api/v1/client/search/titular-contacto ───────────────────────────

  private async ejecutarContacto(q: TitularContactoSql): Promise<Record<string, unknown> | undefined> {
    const req = this.db.request();
    const T = this.db.types;
    for (const p of q.params) {
      if (p.type === 'varchar') req.input(p.name, T.VarChar(p.length ?? 15), p.value);
      else req.input(p.name, T.Numeric(18, 0), p.value);
    }
    const result = await req.query(q.sql);
    return (result.recordset ?? [])[0] as Record<string, unknown> | undefined;
  }

  /**
   * Correo del titular de un vehículo para el código de un solo uso del portal de siniestros.
   * Solo hay coincidencia si existe una póliza de Auto/RCV con esa placa cuyo asegurado o tomador sea la
   * cédula: así no se revela el correo de una placa ajena. Devuelve el correo completo al servicio que
   * consulta (scope `client:read`); quien lo consume debe enmascararlo.
   */
  async getTitularContacto(
    filtros: Pick<SearchTitularContactoDto, 'placa' | 'cci_rif'>,
  ): Promise<{ encontrada: boolean; correo: string | null }> {
    try {
      const emision = await this.ejecutarContacto(buildCorreoEmisionQuery(filtros.placa, filtros.cci_rif));
      const poliza = await this.ejecutarContacto(buildPolizaYCorreoMaestroQuery(filtros.placa, filtros.cci_rif));
      if (!poliza) return { encontrada: false, correo: null };
      const correo = String(emision?.correo ?? poliza.correo ?? '').trim();
      return { encontrada: true, correo: correo || null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getTitularContacto: ${msg}`);
      throw new InternalServerErrorException('Error al consultar el contacto del titular.');
    }
  }

  // ── GET /api/v1/client/siniestros/validar ────────────────────────────────

  /**
   * Validación previa de una declaración con el procedimiento oficial de SIS2000 (`sp_valida_siniestro_nexus`, copia de `SpValidaSiniestro`,
   * solo lectura): póliza existente y activa, fecha de ocurrencia dentro de la vigencia y recibo del período
   * cobrado. Devuelve el motivo para que el portal explique el rechazo.
   */
  async validarSiniestro(
    f: ValidateSiniestroDto,
  ): Promise<{ valida: boolean; motivo: 'OK' | 'POLIZA_INACTIVA' | 'FUERA_DE_VIGENCIA' | 'RECIBO_PENDIENTE' | 'OTRO'; mensaje: string }> {
    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('cnpoliza', T.VarChar(30), f.cnpoliza);
      req.input('focurrencia', T.Date, f.focurrencia);
      req.input('fnotificacion', T.Date, f.fnotificacion);
      // Solo se envía cuando se pide: así funciona también con la versión anterior del SP (sin este parámetro).
      if (f.exigirRecibo) req.input('exigir_recibo', T.Bit, true);
      req.output('cerror', T.Int);
      req.output('msj', T.VarChar(255));
      const r = await req.execute(SP_VALIDA_SINIESTRO_NEXUS);
      const cerror = Number(r.output?.cerror ?? 0);
      const mensaje = String(r.output?.msj ?? '').trim();
      if (cerror === 0) return { valida: true, motivo: 'OK', mensaje: '' };
      const m = mensaje.toLowerCase();
      const motivo = m.includes('recibo')
        ? 'RECIBO_PENDIENTE'
        : m.includes('vigencia')
          ? 'FUERA_DE_VIGENCIA'
          : m.includes('no existe') || m.includes('estado activo')
            ? 'POLIZA_INACTIVA'
            : 'OTRO';
      return { valida: false, motivo, mensaje };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`validarSiniestro: ${msg}`);
      throw new InternalServerErrorException('Error al validar el siniestro.');
    }
  }
}
