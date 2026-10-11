import { ConflictException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { MssqlService } from '../../database/mssql.service';
import { CrearIntermediarioDto } from './dto/crear-intermediario.dto';

export interface IntermediarioCreado {
  cproductor: number;
  xcorreo: string;
  claveTemporal: string;
}

/** Clave temporal legible (sin caracteres ambiguos). */
function generarClaveTemporal(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(10), (b) => alfabeto[b % alfabeto.length]).join('');
}

/**
 * Alta de intermediario tradicional en Sis2000, con los mismos SPs y parámetros que la pasarela
 * (lamundialcms, agencies_masters_model::create_agencia_master_sisip_completo), en UNA transacción:
 *   1. spCreateMaclient            -> maclient (+ correo, tel, dir, atr)
 *   2. spCreateMaproduc            -> maproduc, maclient_rel
 *   3. spCreateUsuarioCorredorWeb  -> seusuariosweb, macorredores_web
 *   4. spCreateGestorWeb           -> magestor (cgestor_anterior = NULL)
 */
@Injectable()
export class IntermediariosService {
  private readonly logger = new Logger(IntermediariosService.name);

  constructor(private readonly mssql: MssqlService) {}

  async crear(dto: CrearIntermediarioDto): Promise<IntermediarioCreado> {
    const sql = this.mssql.types;
    const cciRif = Number(dto.cci_rif);
    const nombre = (dto.xnombre || dto.xcliente).toUpperCase();
    const apellido = (dto.xapellido || '').toUpperCase();
    const razonSocial = dto.xcliente.toUpperCase();
    const telefono = dto.xtelefono;

    const tx = this.mssql.transaction();
    await tx.begin();
    const req = () => new sql.Request(tx);

    try {
      const rif = await req()
        .input('cci_rif', sql.Numeric(13, 0), cciRif)
        .query('SELECT COUNT(*) AS existe FROM maproduc WHERE cci_rif = @cci_rif');
      if (rif.recordset[0].existe > 0) {
        throw new ConflictException(`Ya existe un intermediario con la cédula/RIF ${cciRif}.`);
      }

      // Código indicado o el siguiente libre, bloqueado dentro de la transacción
      let cproductor: number;
      if (dto.cproductor) {
        cproductor = Number(dto.cproductor);
        const enUso = await req()
          .input('cproductor', sql.Numeric(11, 0), cproductor)
          .query('SELECT COUNT(*) AS existe FROM maproduc WITH (UPDLOCK, HOLDLOCK) WHERE cproductor = @cproductor');
        if (enUso.recordset[0].existe > 0) {
          throw new ConflictException(`El código de intermediario ${cproductor} ya está en uso.`);
        }
      } else {
        const siguiente = await req().query(
          'SELECT ISNULL(MAX(cproductor), 80000) + 1 AS next_code FROM maproduc WITH (UPDLOCK, HOLDLOCK)',
        );
        cproductor = Number(siguiente.recordset[0].next_code);
      }

      // 1. Cliente
      await req()
        .input('icedula', sql.Char(1), dto.icedula)
        .input('cci_rif', sql.Numeric(13, 0), cciRif)
        .input('xnombre', sql.VarChar(120), nombre.substring(0, 120))
        .input('xapellido', sql.VarChar(120), apellido.substring(0, 120))
        .input('xcliente', sql.VarChar(240), razonSocial)
        .input('isexo', sql.Char(1), null)
        .input('iestado_civil', sql.Char(1), null)
        .input('fnac', sql.DateTime, null)
        .input('xcorreo', sql.Char(60), dto.xcorreo)
        .input('cpais', sql.SmallInt, 58)
        .input('cestado', sql.SmallInt, 0)
        .input('cciudad', sql.SmallInt, 0)
        .input('xdireccion', sql.Char(60), dto.xdireccion || '')
        .input('czonapos', sql.Char(10), '')
        .input('xtelefono', sql.Char(20), telefono)
        .input('ifuente', sql.Char(10), 'SIS2000')
        .output('salida', sql.VarChar(50))
        .execute('spCreateMaclient');

      // 2. Productor
      const maproduc = await req()
        .input('cci_rif', sql.Numeric(13, 0), cciRif)
        .input('xproductor', sql.VarChar(240), razonSocial)
        .input('ccarnet', sql.Char(10), null)
        .input('csucur', sql.SmallInt, dto.csucur ?? 1)
        .input('cbanco', sql.SmallInt, null)
        .input('cbanco2', sql.SmallInt, null)
        .input('ccuentaban', sql.Char(30), null)
        .input('ccuentaban2', sql.Char(30), null)
        .input('istatpro', sql.Char(1), 'V')
        .input('xcontacto', sql.Char(60), telefono)
        .input('itipocta', sql.Char(2), null)
        .input('itipocta2', sql.Char(2), null)
        .input('iformapago', sql.Char(1), 'T')
        .input('ctipoprod', sql.SmallInt, dto.ctipoprod ?? 2)
        .input('xcorreo', sql.NVarChar(60), dto.xcorreo)
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('ifuente', sql.NVarChar(10), 'SIS2000')
        .execute('spCreateMaproduc');
      cproductor = Number(maproduc.recordset?.[0]?.cproductor) || cproductor;

      // 3. Usuario web (bcrypt: el formato que valida el login de Sis2000)
      const claveTemporal = generarClaveTemporal();
      const claveCifrada = await bcrypt.hash(claveTemporal, 10);
      await req()
        .input('xcliente', sql.VarChar(200), razonSocial)
        .input('xlogin', sql.VarChar(200), dto.xcorreo)
        .input('xcorreo', sql.VarChar(200), dto.xcorreo)
        .input('xcontrasena', sql.VarChar(200), claveCifrada)
        .input('ccorredor', sql.VarChar(50), String(cproductor))
        .input('edit', sql.Int, 0)
        .input('id_agency', sql.Int, null)
        .input('id_adviser', sql.Int, null)
        .execute('spCreateUsuarioCorredorWeb');

      // 4. Gestor (cgestor_anterior en NULL, igual que la pasarela)
      await req()
        .input('cgestor_anterior', sql.VarChar(20), null)
        .input('cproductor', sql.Int, cproductor)
        .input('xgestor', sql.VarChar(200), razonSocial)
        .input('xcorreo', sql.VarChar(200), dto.xcorreo)
        .input('ctipocanal', sql.Char(1), 'T')
        .input('ccanalalt', sql.Int, null)
        .input('cscanalalt', sql.Int, null)
        .input('id_adviser', sql.Int, null)
        .input('id_agency', sql.Int, null)
        .input('edit', sql.Bit, 0)
        .execute('spCreateGestorWeb');

      await tx.commit();
      this.logger.log(`Intermediario creado cproductor=${cproductor} correo=${dto.xcorreo}`);
      return { cproductor, xcorreo: dto.xcorreo, claveTemporal };
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        /* SQL Server ya abortó la transacción */
      }
      if (err instanceof ConflictException) throw err;
      const mensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo alta de intermediario (rif=${cciRif}): ${mensaje}`);
      throw new InternalServerErrorException(`No fue posible crear el intermediario: ${mensaje}`);
    }
  }
}
