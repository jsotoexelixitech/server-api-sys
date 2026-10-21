import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MssqlService } from '../../database/mssql.service';
import { CrearIntermediarioDto } from './dto/crear-intermediario.dto';
import { CrearCanalDto } from './dto/crear-canal.dto';
import { CrearGestorDto } from './dto/crear-gestor.dto';

export interface IntermediarioCreado {
  cproductor: number;
  xcorreo: string;
  xlogin: string;
  claveTemporal: string;
}

export interface CanalCreado {
  ccanalalt: number;
  ctipocanal: string;
  cgestor: string | null;
}

export interface GestorCreado {
  cgestor: string | null;
  cgestor_padre: string;
  ctipocanal: string | null;
  ccanalalt: number | null;
  cscanalalt: number | null;
}

export interface Banco {
  cbanco: number;
  cbanco_ref: string;
  xbanco: string;
}

/** Cuenta lista para maproduc: banco resuelto por los 4 primeros dígitos y número con guiones. */
interface CuentaMaproduc {
  cbanco: number;
  ccuentaban: string;
  itipocta: string;
}

export interface GestorResumen {
  cgestor: string;
  xgestor: string;
  xcorreo: string;
  ctipocanal: string | null;
  ccanalalt: number | null;
  cscanalalt: number | null;
}

/** Gestor raíz de La Mundial del que cuelgan los canales Alterno / Directo (igual que la pasarela). */
const GESTOR_RAIZ_CANALES = '80080';

/**
 * Clave temporal en MAYÚSCULAS y números, sin caracteres ambiguos (0/O, 1/I/L): el login de Sis2000
 * muestra los campos en mayúsculas y compara xcontrasena tal cual (auth/signIn y portal-auth).
 */
function generarClaveTemporal(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
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
    // Tipo de ente en Sis2000 (maclient.ipersona): N natural (V/E/P) o J jurídica (J/G)
    const ipersonaDocumento = ['J', 'G'].includes(dto.icedula) ? 'J' : 'N';
    const ipersona = dto.ipersona ?? ipersonaDocumento;
    if (ipersona !== ipersonaDocumento) {
      throw new BadRequestException(
        ipersona === 'N'
          ? 'Persona natural requiere cédula V, E o pasaporte P.'
          : 'Persona jurídica requiere RIF J o G.',
      );
    }
    const cuentas = await this.resolverCuentas(dto.cuentas ?? []);

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
      const cliente = await req()
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
      if (cliente.output?.salida) {
        this.logger.log(`spCreateMaclient rif=${cciRif}: ${cliente.output.salida}`);
      }

      // 2. Productor
      const maproduc = await req()
        .input('cci_rif', sql.Numeric(13, 0), cciRif)
        .input('xproductor', sql.VarChar(240), razonSocial)
        .input('ccarnet', sql.Char(10), null)
        .input('csucur', sql.SmallInt, dto.csucur ?? 1)
        .input('cbanco', sql.SmallInt, cuentas[0]?.cbanco ?? null)
        .input('cbanco2', sql.SmallInt, cuentas[1]?.cbanco ?? null)
        .input('ccuentaban', sql.Char(30), cuentas[0]?.ccuentaban ?? null)
        .input('ccuentaban2', sql.Char(30), cuentas[1]?.ccuentaban ?? null)
        .input('istatpro', sql.Char(1), 'V')
        .input('xcontacto', sql.Char(60), telefono)
        .input('itipocta', sql.Char(2), cuentas[0]?.itipocta ?? null)
        .input('itipocta2', sql.Char(2), cuentas[1]?.itipocta ?? null)
        .input('iformapago', sql.Char(1), 'T')
        .input('ctipoprod', sql.SmallInt, dto.ctipoprod ?? 2)
        .input('xcorreo', sql.NVarChar(60), dto.xcorreo)
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('ifuente', sql.NVarChar(10), 'SIS2000')
        .execute('spCreateMaproduc');
      cproductor = Number(maproduc.recordset?.[0]?.cproductor) || cproductor;

      // 3. Usuario web. xlogin en mayúsculas como el resto de usuarios de Sis2000 y la clave como la
      //    compara el login (seusuariosweb.xcontrasena = @xcontrasena, sin hash).
      const claveTemporal = generarClaveTemporal();
      await req()
        .input('xcliente', sql.VarChar(200), razonSocial)
        .input('xlogin', sql.VarChar(200), dto.xcorreo.toUpperCase())
        .input('xcorreo', sql.VarChar(200), dto.xcorreo)
        .input('xcontrasena', sql.VarChar(200), claveTemporal)
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

      // 5. Tipo de ente al final del alta: en QA el registro de maclient puede quedar creado por otro SP del alta
      //    (cprog vacío, ifuente SQL) con la letra del documento (V, E, G...). La pantalla de Sis2000 solo reconoce
      //    N o J: se corrige solo cuando el valor actual no es N ni J.
      await req()
        .input('cci_rif', sql.Numeric(13, 0), cciRif)
        .input('ipersona', sql.Char(1), ipersona)
        .query(`UPDATE maclient SET ipersona = @ipersona
                 WHERE cci_rif = @cci_rif AND ISNULL(LTRIM(RTRIM(ipersona)), '') NOT IN ('N', 'J')`);

      await tx.commit();
      this.logger.log(`Intermediario creado cproductor=${cproductor} correo=${dto.xcorreo}`);
      return { cproductor, xcorreo: dto.xcorreo, xlogin: dto.xcorreo.toUpperCase(), claveTemporal };
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

  /**
   * Canal Alterno / Directo con su gestor (pasarela: create_agencia_canal_sisip), en una transacción:
   *   spCreateCanal (macanalalt) -> spCreateGestorWeb (cgestor_anterior 80080, ctipocanal A/D, ccanalalt nuevo)
   */
  async crearCanal(dto: CrearCanalDto): Promise<CanalCreado> {
    const sql = this.mssql.types;
    const tx = this.mssql.transaction();
    await tx.begin();
    const req = () => new sql.Request(tx);

    try {
      await this.asegurarCorreoLibre(req, dto.xcorreo);

      const siguiente = await req().query(
        'SELECT ISNULL(MAX(ccanalalt), 0) + 1 AS next_code FROM macanalalt WITH (UPDLOCK, HOLDLOCK)',
      );
      const ccanalalt = Number(siguiente.recordset[0].next_code);

      await req()
        .input('xcanalalt', sql.VarChar(150), dto.xcanalalt)
        .input('ctipocanal', sql.Char(1), dto.ctipocanal)
        .input('ccategoriacanal', sql.Int, 0)
        .input('ccanalalt', sql.Int, ccanalalt)
        .execute('spCreateCanal');

      await req()
        .input('cgestor_anterior', sql.VarChar(20), GESTOR_RAIZ_CANALES)
        .input('cproductor', sql.Int, null)
        .input('xgestor', sql.VarChar(200), dto.xcanalalt)
        .input('xcorreo', sql.VarChar(200), dto.xcorreo)
        .input('ctipocanal', sql.Char(1), dto.ctipocanal)
        .input('ccanalalt', sql.Int, ccanalalt)
        .input('cscanalalt', sql.Int, null)
        .input('id_adviser', sql.Int, null)
        .input('id_agency', sql.Int, null)
        .input('edit', sql.Bit, 0)
        .execute('spCreateGestorWeb');

      const cgestor = await this.cgestorPorCorreo(req, dto.xcorreo);
      await tx.commit();
      this.logger.log(`Canal ${dto.ctipocanal} creado ccanalalt=${ccanalalt} cgestor=${cgestor}`);
      return { ccanalalt, ctipocanal: dto.ctipocanal, cgestor };
    } catch (err) {
      await this.deshacer(tx);
      if (err instanceof ConflictException) throw err;
      const mensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo alta de canal (${dto.xcanalalt}): ${mensaje}`);
      throw new InternalServerErrorException(`No fue posible crear el canal: ${mensaje}`);
    }
  }

  /**
   * Agencia (nivel 2) o asesor (nivel 3): gestor hijo de otro gestor (pasarela: agencias / asesores).
   * Hereda el tipo de canal, el canal y el subcanal del padre.
   */
  async crearGestor(dto: CrearGestorDto): Promise<GestorCreado> {
    const sql = this.mssql.types;
    const tx = this.mssql.transaction();
    await tx.begin();
    const req = () => new sql.Request(tx);

    try {
      const padre = await req()
        .input('cgestor', sql.VarChar(50), dto.cgestor_padre)
        .query<{ cgestor: string; ctipocanal: string | null; ccanalalt: number | null; cscanalalt: number | null }>(
          'SELECT TOP (1) cgestor, ctipocanal, ccanalalt, cscanalalt FROM magestor WHERE LTRIM(RTRIM(cgestor)) = @cgestor',
        );
      const datosPadre = padre.recordset[0];
      if (!datosPadre) {
        throw new NotFoundException(`No existe el gestor padre ${dto.cgestor_padre}.`);
      }

      await this.asegurarCorreoLibre(req, dto.xcorreo);

      const ctipocanal = datosPadre.ctipocanal ? String(datosPadre.ctipocanal).trim() : 'T';
      await req()
        .input('cgestor_anterior', sql.VarChar(20), String(datosPadre.cgestor).trim())
        .input('cproductor', sql.Int, null)
        .input('xgestor', sql.VarChar(200), dto.xgestor)
        .input('xcorreo', sql.VarChar(200), dto.xcorreo)
        .input('ctipocanal', sql.Char(1), ctipocanal)
        .input('ccanalalt', sql.Int, datosPadre.ccanalalt ?? null)
        .input('cscanalalt', sql.Int, datosPadre.cscanalalt ?? null)
        .input('id_adviser', sql.Int, null)
        .input('id_agency', sql.Int, null)
        .input('edit', sql.Bit, 0)
        .execute('spCreateGestorWeb');

      const cgestor = await this.cgestorPorCorreo(req, dto.xcorreo);
      await tx.commit();
      this.logger.log(`Gestor creado cgestor=${cgestor} padre=${dto.cgestor_padre}`);
      return {
        cgestor,
        cgestor_padre: String(datosPadre.cgestor).trim(),
        ctipocanal,
        ccanalalt: datosPadre.ccanalalt ?? null,
        cscanalalt: datosPadre.cscanalalt ?? null,
      };
    } catch (err) {
      await this.deshacer(tx);
      if (err instanceof ConflictException || err instanceof NotFoundException) throw err;
      const mensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo alta de gestor (padre=${dto.cgestor_padre}): ${mensaje}`);
      throw new InternalServerErrorException(`No fue posible crear el gestor: ${mensaje}`);
    }
  }

  /** Bancos nacionales activos con código de 4 dígitos (mabanco), para las cuentas del intermediario. */
  async bancos(): Promise<Banco[]> {
    const res = await this.mssql.request().query<Banco>(
      `SELECT CBANCO AS cbanco, LTRIM(RTRIM(CBANCO_REF)) AS cbanco_ref, LTRIM(RTRIM(XBANCO)) AS xbanco
         FROM mabanco
        WHERE ITIPO = 'V' AND BACTIVO = 1 AND LEN(LTRIM(RTRIM(CBANCO_REF))) = 4
        ORDER BY LTRIM(RTRIM(XBANCO))`,
    );
    return res.recordset;
  }

  /**
   * Valida las cuentas (20 dígitos, sin repetir) y resuelve el banco por sus 4 primeros dígitos (mabanco.CBANCO_REF).
   * Se guardan con guiones (0105-0067-2110-6747-8957), igual que las cuentas que ya tiene maproduc.
   */
  private async resolverCuentas(cuentas: { ccuenta: string; itipocta: string }[]): Promise<CuentaMaproduc[]> {
    if (!cuentas.length) return [];
    if (new Set(cuentas.map((c) => c.ccuenta)).size !== cuentas.length) {
      throw new BadRequestException('Las dos cuentas bancarias son iguales.');
    }
    const bancos = new Map((await this.bancos()).map((b) => [b.cbanco_ref, b]));
    return cuentas.map((c) => {
      const banco = bancos.get(c.ccuenta.slice(0, 4));
      if (!banco) {
        throw new BadRequestException(`La cuenta ${c.ccuenta} no corresponde a un banco nacional activo (código ${c.ccuenta.slice(0, 4)}).`);
      }
      return {
        cbanco: banco.cbanco,
        ccuentaban: c.ccuenta.match(/.{4}/g)!.join('-'),
        itipocta: c.itipocta,
      };
    });
  }

  /** Busca gestores (posibles padres) por código, nombre o correo. */
  async buscarGestores(texto: string): Promise<GestorResumen[]> {
    const sql = this.mssql.types;
    const termino = String(texto || '').trim();
    if (termino.length < 2) return [];
    const res = await this.mssql
      .request()
      .input('q', sql.VarChar(120), `%${termino}%`)
      .query<GestorResumen>(
        `SELECT TOP (20) LTRIM(RTRIM(cgestor)) AS cgestor, LTRIM(RTRIM(xgestor)) AS xgestor,
                LTRIM(RTRIM(xcorreo)) AS xcorreo, ctipocanal, ccanalalt, cscanalalt
           FROM magestor
          WHERE cgestor LIKE @q OR xgestor LIKE @q OR xcorreo LIKE @q
          ORDER BY xgestor`,
      );
    return res.recordset;
  }

  private async asegurarCorreoLibre(req: () => any, xcorreo: string): Promise<void> {
    const sql = this.mssql.types;
    const existe = await req()
      .input('xcorreo', sql.VarChar(200), xcorreo)
      .query('SELECT COUNT(*) AS existe FROM magestor WHERE LTRIM(RTRIM(xcorreo)) = @xcorreo');
    if (existe.recordset[0].existe > 0) {
      throw new ConflictException(`Ya existe un gestor con el correo ${xcorreo}.`);
    }
  }

  private async cgestorPorCorreo(req: () => any, xcorreo: string): Promise<string | null> {
    const sql = this.mssql.types;
    const res = await req()
      .input('xcorreo', sql.VarChar(200), xcorreo)
      .query('SELECT TOP (1) LTRIM(RTRIM(cgestor)) AS cgestor FROM magestor WHERE LTRIM(RTRIM(xcorreo)) = @xcorreo ORDER BY cgestor DESC');
    return res.recordset[0]?.cgestor ?? null;
  }

  private async deshacer(tx: { rollback(): Promise<void> }): Promise<void> {
    try {
      await tx.rollback();
    } catch {
      /* SQL Server ya abortó la transacción */
    }
  }
}
