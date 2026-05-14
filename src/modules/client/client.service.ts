import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';

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
}
