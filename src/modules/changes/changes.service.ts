import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { ChangeClientDto } from './dto/change-client.dto';

export { ChangeClientDto };

@Injectable()
export class ChangesService {
  private readonly logger = new Logger(ChangesService.name);

  constructor(private readonly db: MssqlService) {}

  // ── POST /api/v1/changes/client ──────────────────────────────────────────

  async changeClientData(body: ChangeClientDto): Promise<{ message: string; body: ChangeClientDto }> {
    const T = this.db.types;

    // 1. Verificar que el cliente existe
    const checkReq = this.db.request();
    checkReq.input('old_cci_rif', T.VarChar(20), body.old_cci_rif);
    const checkResult = await checkReq.query(`SELECT cci_rif FROM maclient WHERE cci_rif = @old_cci_rif`);

    if (!checkResult.recordset.length) {
      throw new NotFoundException(`Cliente ${body.old_cci_rif} no encontrado.`);
    }

    try {
      const newRif = body.cci_rif ?? body.old_cci_rif;

      // 2. Actualizar maclient
      const clientReq = this.db.request();
      clientReq.input('old_cci_rif',   T.VarChar(20),   body.old_cci_rif);
      clientReq.input('cci_rif',       T.VarChar(20),   newRif);
      clientReq.input('ipersona',      T.Char(1),       body.icedula ?? body.ipersona ?? null);
      clientReq.input('xcliente',      T.VarChar(120),  body.xcliente      ?? null);
      clientReq.input('xnombre',       T.VarChar(60),   body.xnombre       ?? null);
      clientReq.input('xapellido',     T.VarChar(60),   body.xapellido     ?? null);
      clientReq.input('fnacimiento',   T.Date,          body.fnacimiento   ?? null);
      clientReq.input('isexo',         T.Char(1),       body.isexo         ?? null);
      clientReq.input('iestado_civil', T.Char(1),       body.iestado_civil ?? null);

      await clientReq.query(`
        UPDATE maclient SET
          cci_rif       = @cci_rif,
          ipersona      = COALESCE(@ipersona,      ipersona),
          xcliente      = COALESCE(@xcliente,      xcliente),
          xnombre       = COALESCE(@xnombre,       xnombre),
          xapellido     = COALESCE(@xapellido,     xapellido),
          fnacimiento   = COALESCE(@fnacimiento,   fnacimiento),
          isexo         = COALESCE(@isexo,         isexo),
          iestado_civil = COALESCE(@iestado_civil, iestado_civil)
        WHERE cci_rif = @old_cci_rif
      `);

      // 3. Si cambió el RIF, actualizar cascada en tablas relacionadas
      if (newRif !== body.old_cci_rif) {
        for (const tbl of ['maclient_tel', 'maclient_dir', 'maclient_correo', 'maclient_atr']) {
          const r = this.db.request();
          r.input('new_rif', T.VarChar(20), newRif);
          r.input('old_rif', T.VarChar(20), body.old_cci_rif);
          await r.query(`UPDATE ${tbl} SET cci_rif = @new_rif WHERE cci_rif = @old_rif`);
        }

        // Actualizar pólizas y recibos
        for (const col of ['casegurado', 'ctenedor', 'cbeneficiario', 'cacreedor']) {
          for (const tbl of ['adpoliza', 'adrecibos', 'vhcerti']) {
            const r = this.db.request();
            r.input('new_rif', T.VarChar(20), newRif);
            r.input('old_rif', T.VarChar(20), body.old_cci_rif);
            await r.query(`UPDATE ${tbl} SET ${col} = @new_rif WHERE ${col} = @old_rif`).catch(() => {
              // Columna puede no existir en todas las tablas, ignorar
            });
          }
        }
      }

      // 4. Actualizar teléfono si viene
      if (body.xtelefono) {
        const telR = this.db.request();
        telR.input('cci_rif',    T.VarChar(20),  newRif);
        telR.input('xtelefono', T.VarChar(20),   body.xtelefono);
        const exists = await telR.query(`SELECT cci_rif FROM maclient_tel WHERE cci_rif = @cci_rif`);
        const telR2 = this.db.request();
        telR2.input('cci_rif',   T.VarChar(20),  newRif);
        telR2.input('xtelefono', T.VarChar(20),  body.xtelefono);
        if (exists.recordset.length) {
          await telR2.query(`UPDATE maclient_tel SET xtelefono = @xtelefono WHERE cci_rif = @cci_rif`);
        } else {
          await telR2.query(`INSERT INTO maclient_tel (cci_rif, xtelefono) VALUES (@cci_rif, @xtelefono)`);
        }
      }

      // 5. Actualizar correo si viene
      if (body.xcorreo) {
        const mailR = this.db.request();
        mailR.input('cci_rif', T.VarChar(20), newRif);
        mailR.input('xcorreo', T.VarChar(100), body.xcorreo);
        const existsMail = await mailR.query(`SELECT cci_rif FROM maclient_correo WHERE cci_rif = @cci_rif`);
        const mailR2 = this.db.request();
        mailR2.input('cci_rif', T.VarChar(20), newRif);
        mailR2.input('xcorreo', T.VarChar(100), body.xcorreo);
        if (existsMail.recordset.length) {
          await mailR2.query(`UPDATE maclient_correo SET xcorreo = @xcorreo WHERE cci_rif = @cci_rif`);
        } else {
          await mailR2.query(`INSERT INTO maclient_correo (cci_rif, xcorreo) VALUES (@cci_rif, @xcorreo)`);
        }
      }

      this.logger.log(`changeClientData: ${body.old_cci_rif} → ${newRif} OK`);
      return { message: 'Cambios al cliente realizados con éxito', body };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`changeClientData: ${msg}`);
      throw new InternalServerErrorException('Error al actualizar datos del cliente.');
    }
  }
}
