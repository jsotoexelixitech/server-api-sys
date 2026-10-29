import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { MssqlService } from '../../database/mssql.service';
import { MailService } from '../mail/mail.service';
import { CrearIntermediarioDto } from './dto/crear-intermediario.dto';
import { CrearCanalDto } from './dto/crear-canal.dto';
import { CrearGestorDto } from './dto/crear-gestor.dto';

export interface IntermediarioCreado {
  cproductor: number;
  xcorreo: string;
  xlogin: string;
  claveTemporal: string;
  /** Correo con el usuario y la clave enviado al intermediario (false si el envío está apagado o falló) */
  correoEnviado: boolean;
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
 *   2. spCreateMaproduc            -> maproduc, maclient_rel (carnet = código; luego la zona)
 *   3. spCreateUsuarioCorredorWeb  -> seusuariosweb, macorredores_web
 *   4. spCreateGestorWeb           -> magestor (cgestor_anterior = NULL)
 * Tras el commit se envía al intermediario el correo con su usuario y clave temporal.
 */
@Injectable()
export class IntermediariosService {
  private readonly logger = new Logger(IntermediariosService.name);

  constructor(
    private readonly mssql: MssqlService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

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
    const persona = this.datosPersonaNatural(dto, ipersona);
    // Tipo de productor (MAITPROD): jurídica siempre 3 Sociedad de corretaje; natural 1 Agente exclusivo o 2 Corredor
    if (ipersona === 'N' && dto.ctipoprod === 3) {
      throw new BadRequestException('Persona natural: el tipo de productor es Corredor o Agente exclusivo, no Sociedad de corretaje.');
    }
    const ctipoprod = ipersona === 'J' ? 3 : (dto.ctipoprod ?? 2);

    const tx = this.mssql.transaction();
    await tx.begin();
    const req = () => new sql.Request(tx);

    let creado: Omit<IntermediarioCreado, 'correoEnviado'>;
    try {
      // Duplicados: RIF y correo bloqueados dentro de la transacción (dos altas simultáneas no pasan las dos)
      const rif = await req()
        .input('cci_rif', sql.Numeric(13, 0), cciRif)
        .query('SELECT COUNT(*) AS existe FROM maproduc WITH (UPDLOCK, HOLDLOCK) WHERE cci_rif = @cci_rif');
      if (rif.recordset[0].existe > 0) {
        throw new ConflictException(`Ya existe un intermediario con la cédula/RIF ${cciRif}.`);
      }
      await this.asegurarCorreoIntermediarioLibre(req, dto.xcorreo);

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
        .input('isexo', sql.Char(1), persona.isexo)
        .input('iestado_civil', sql.Char(1), persona.iestado_civil)
        .input('fnac', sql.DateTime, persona.fnac)
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
        .input('ccarnet', sql.Char(10), String(cproductor))
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
        .input('ctipoprod', sql.SmallInt, ctipoprod)
        .input('xcorreo', sql.NVarChar(60), dto.xcorreo)
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('ifuente', sql.NVarChar(10), 'SIS2000')
        .execute('spCreateMaproduc');
      // spCreateMaproduc no lanza error: si el RIF o el código ya existen devuelve status ERROR y deshace lo suyo
      const productor = maproduc.recordset?.[0];
      if (String(productor?.status ?? '').trim().toUpperCase() === 'ERROR') {
        throw new ConflictException(productor?.message || 'No fue posible crear el productor (RIF o código ya existente).');
      }
      cproductor = Number(productor?.cproductor) || cproductor;

      // Zona (maproduc.czonprod): spCreateMaproduc la deja en NULL. Sociedad de corretaje 2; productor 1.
      await req()
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('czonprod', sql.SmallInt, ctipoprod === 3 ? 2 : 1)
        .query('UPDATE maproduc SET czonprod = @czonprod WHERE cproductor = @cproductor');

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

      // 5. Datos del cliente al final del alta: en QA el registro de maclient puede quedar creado por otro SP del
      //    alta (cprog vacío, ifuente SQL) con la letra del documento (V, E, G...) y sin sexo / estado civil / fecha.
      //    Tipo de ente: la pantalla de Sis2000 solo reconoce N o J, se corrige si no es N ni J.
      //    Sexo, estado civil y fecha de nacimiento: solo se completan si están vacíos (no se pisa lo que ya había).
      await req()
        .input('cci_rif', sql.Numeric(13, 0), cciRif)
        .input('ipersona', sql.Char(1), ipersona)
        .input('isexo', sql.Char(1), persona.isexo)
        .input('iestado_civil', sql.Char(1), persona.iestado_civil)
        .input('fnac', sql.DateTime, persona.fnac)
        .query(`UPDATE maclient
                    SET ipersona = CASE WHEN ISNULL(LTRIM(RTRIM(ipersona)), '') IN ('N', 'J') THEN ipersona ELSE @ipersona END,
                        isexo = CASE WHEN @isexo IS NOT NULL AND ISNULL(LTRIM(RTRIM(isexo)), '') NOT IN ('M', 'F')
                                     THEN @isexo ELSE isexo END,
                        iestado_civil = CASE WHEN @iestado_civil IS NOT NULL
                                              AND ISNULL(LTRIM(RTRIM(iestado_civil)), '') NOT IN ('S', 'C', 'D', 'V', 'U')
                                             THEN @iestado_civil ELSE iestado_civil END,
                        fnacimiento = COALESCE(fnacimiento, @fnac)
                  WHERE cci_rif = @cci_rif`);

      await tx.commit();
      this.logger.log(`Intermediario creado cproductor=${cproductor} correo=${dto.xcorreo}`);
      creado = { cproductor, xcorreo: dto.xcorreo, xlogin: dto.xcorreo.toUpperCase(), claveTemporal };
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        /* SQL Server ya abortó la transacción */
      }
      if (err instanceof ConflictException) throw err;
      const mensaje = err instanceof Error ? err.message : String(err);
      // Respaldo: si un SP de La Mundial detecta el duplicado (p. ej. "USUARIO ... YA ESTÁ REGISTRADO"), es 409, no 500
      if (/YA EST[ÁA] REGISTRAD|YA EXISTE/i.test(mensaje)) {
        throw new ConflictException(mensaje);
      }
      this.logger.error(`Fallo alta de intermediario (rif=${cciRif}): ${mensaje}`);
      throw new InternalServerErrorException(`No fue posible crear el intermediario: ${mensaje}`);
    }

    // Fuera de la transacción: si el correo falla, el intermediario ya quedó creado y la pantalla muestra la clave
    return { ...creado, correoEnviado: await this.enviarCorreoAcceso(creado, razonSocial) };
  }

  /** Correo al intermediario con su código, usuario y clave temporal (módulo mail, plantilla branded). */
  private async enviarCorreoAcceso(creado: Omit<IntermediarioCreado, 'correoEnviado'>, razonSocial: string): Promise<boolean> {
    const urlSis2000 = this.config.get<string>('SIS2000_LOGIN_URL')?.trim();
    try {
      const res = await this.mail.sendTemplatedEmail({
        to: creado.xcorreo,
        toName: razonSocial,
        template: 'branded',
        data: {
          subject: 'Tu usuario de Sis2000 - La Mundial de Seguros',
          title: 'Tu usuario de Sis2000 está listo',
          intro: `${razonSocial}, ya estás registrado como intermediario de La Mundial de Seguros. Estos son tus datos de acceso a Sis2000:`,
          ctaLabel: urlSis2000 ? 'Ingresar a Sis2000' : undefined,
          ctaUrl: urlSis2000 || undefined,
          extraNote: 'La clave es temporal: te recomendamos cambiarla en tu primer ingreso. No compartas estos datos con nadie.',
        },
        fields: [
          { label: 'Código de productor', value: String(creado.cproductor) },
          { label: 'Usuario', value: creado.xlogin },
          { label: 'Clave temporal', value: creado.claveTemporal },
        ],
      });
      if (res.sent) {
        this.logger.log(`Correo de acceso enviado cproductor=${creado.cproductor} a ${creado.xcorreo}`);
      } else {
        this.logger.warn(`Correo de acceso NO enviado cproductor=${creado.cproductor}: ${res.error ?? res.mode}`);
      }
      return res.sent;
    } catch (err) {
      this.logger.warn(`Correo de acceso NO enviado cproductor=${creado.cproductor}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
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

  /**
   * Persona natural: fecha de nacimiento (mayor de 18), sexo (M/F) y estado civil (S/C/D/V/U) son obligatorios.
   * Persona jurídica: no aplican (van vacíos).
   */
  private datosPersonaNatural(
    dto: CrearIntermediarioDto,
    ipersona: string,
  ): { fnac: Date | null; isexo: string | null; iestado_civil: string | null } {
    if (ipersona !== 'N') return { fnac: null, isexo: null, iestado_civil: null };
    if (!dto.fnacimiento || !dto.isexo || !dto.iestado_civil) {
      throw new BadRequestException('Persona natural: indica fecha de nacimiento, sexo y estado civil.');
    }
    const fnac = new Date(`${dto.fnacimiento.slice(0, 10)}T00:00:00Z`);
    const mayorDeEdad = new Date();
    mayorDeEdad.setUTCFullYear(mayorDeEdad.getUTCFullYear() - 18);
    if (Number.isNaN(fnac.getTime()) || fnac.getUTCFullYear() < 1900 || fnac > mayorDeEdad) {
      throw new BadRequestException('La fecha de nacimiento no es válida: el intermediario debe ser mayor de 18 años.');
    }
    return { fnac, isexo: dto.isexo, iestado_civil: dto.iestado_civil };
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

  /** Canal / agencia / asesor: el correo no puede ser de otro gestor (bloqueado dentro de la transacción). */
  private async asegurarCorreoLibre(req: () => any, xcorreo: string): Promise<void> {
    const sql = this.mssql.types;
    const existe = await req()
      .input('xcorreo', sql.VarChar(200), xcorreo)
      .query('SELECT COUNT(*) AS existe FROM magestor WITH (UPDLOCK, HOLDLOCK) WHERE xcorreo = @xcorreo');
    if (existe.recordset[0].existe > 0) {
      throw new ConflictException(`Ya existe un gestor con el correo ${xcorreo}.`);
    }
  }

  /**
   * Intermediario: el correo es su usuario web. No puede estar en MACORREDORES_WEB (lo que valida
   * spCreateUsuarioCorredorWeb), como login en seusuariosweb ni como correo de otro gestor.
   * Comparación por igualdad (collation CI de Sis2000) para poder bloquear por índice dentro de la transacción.
   */
  private async asegurarCorreoIntermediarioLibre(req: () => any, xcorreo: string): Promise<void> {
    const sql = this.mssql.types;
    const res = await req()
      .input('xcorreo', sql.VarChar(200), xcorreo)
      .input('xlogin', sql.VarChar(200), xcorreo.toUpperCase())
      .query(
        `SELECT (SELECT COUNT(*) FROM MACORREDORES_WEB WITH (UPDLOCK, HOLDLOCK) WHERE xcorreo = @xcorreo) AS corredor,
                (SELECT COUNT(*) FROM seusuariosweb WITH (UPDLOCK, HOLDLOCK) WHERE xlogin = @xlogin) AS usuario,
                (SELECT COUNT(*) FROM magestor WITH (UPDLOCK, HOLDLOCK) WHERE xcorreo = @xcorreo) AS gestor`,
      );
    const fila = res.recordset[0];
    if (fila.corredor > 0 || fila.usuario > 0) {
      throw new ConflictException(`Ya existe un usuario con el correo ${xcorreo}. Usa otro correo.`);
    }
    if (fila.gestor > 0) {
      throw new ConflictException(`El correo ${xcorreo} ya está registrado en otro gestor. Usa otro correo.`);
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
