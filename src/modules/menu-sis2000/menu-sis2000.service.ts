import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { GuardarOpcionDto, GuardarPlantillaDto, GuardarPrincipalDto } from './dto/guardar-menu.dto';

/** Departamento de Desarrollo (root): único que puede administrar el menú, como en el front de La Mundial. */
const DEPARTAMENTO_ROOT = 2;

/** Errores de negocio que lanzan los SPs (THROW 99001, '...'). */
const ERROR_NEGOCIO_SP = 99001;

export interface OpcionMenu {
  cmenu: number;
  xmenu: string;
  xruta: string | null;
  istatus: string;
}

export interface DesplegableMenu {
  cmenu_principal: number;
  xmenu: string;
  xicono: string | null;
  xruta: string | null;
  istatus: string;
  opciones: OpcionMenu[];
}

export interface RolSis2000 {
  cdepartamento: number;
  xdepartamento: string;
  crol: number;
  xrol: string;
  usuarios: number;
}

export interface ItemPlantilla {
  cmenuprincipal: number;
  cmenu: number | null;
}

/**
 * Menú lateral de Sis2000 (semenuprincipal, semenu, semenuparam, sedistribucionmenu).
 * Lecturas con SELECT; toda escritura pasa por los SPs de docs/sql/sis2000-menu-sps.sql.
 */
@Injectable()
export class MenuSis2000Service {
  private readonly logger = new Logger(MenuSis2000Service.name);

  constructor(private readonly mssql: MssqlService) {}

  /** Solo usuarios activos del departamento de Desarrollo (root) pueden administrar el menú. */
  async asegurarRoot(cusuario: number): Promise<void> {
    const sql = this.mssql.types;
    if (!Number.isInteger(cusuario) || cusuario <= 0) {
      throw new ForbiddenException('Falta el usuario de Sis2000 que realiza la operación (x-sis2000-cusuario).');
    }
    const res = await this.mssql
      .request()
      .input('cusuario', sql.Int, cusuario)
      .query<{ cdepartamento: number | null }>(
        "SELECT cdepartamento FROM seusuariosweb WHERE cusuario = @cusuario AND istatus = 'V'",
      );
    if (res.recordset[0]?.cdepartamento !== DEPARTAMENTO_ROOT) {
      throw new ForbiddenException('Solo los usuarios del departamento de Desarrollo pueden administrar el menú.');
    }
  }

  /** Árbol completo (activos e inactivos) para la pantalla de administración. */
  async arbol(): Promise<DesplegableMenu[]> {
    const principales = await this.mssql.request().query<Omit<DesplegableMenu, 'opciones'>>(
      `SELECT cmenu_principal, LTRIM(RTRIM(xmenu)) AS xmenu, LTRIM(RTRIM(xicono)) AS xicono,
              LTRIM(RTRIM(xruta)) AS xruta, ISNULL(istatus, 'V') AS istatus
         FROM semenuprincipal
        ORDER BY cmenu_principal`,
    );
    const opciones = await this.mssql.request().query<OpcionMenu & { cmenu_principal: number }>(
      `SELECT cmenu, cmenu_principal, LTRIM(RTRIM(xmenu)) AS xmenu, LTRIM(RTRIM(xruta)) AS xruta,
              ISNULL(istatus, 'V') AS istatus
         FROM semenu
        ORDER BY cmenu`,
    );
    return principales.recordset.map((p) => ({
      ...p,
      opciones: opciones.recordset
        .filter((o) => o.cmenu_principal === p.cmenu_principal)
        .map(({ cmenu_principal: _padre, ...o }) => o),
    }));
  }

  /** Departamentos + roles, con cuántos usuarios activos tiene cada uno. */
  async roles(): Promise<RolSis2000[]> {
    const res = await this.mssql.request().query<RolSis2000>(
      `SELECT r.cdepartamento, LTRIM(RTRIM(d.xdepartamento)) AS xdepartamento,
              r.crol, LTRIM(RTRIM(r.xrol)) AS xrol,
              (SELECT COUNT(*) FROM seusuariosweb u
                WHERE u.cdepartamento = r.cdepartamento AND u.crol = r.crol AND u.istatus = 'V') AS usuarios
         FROM serol r
        INNER JOIN sedepartamento d ON d.cdepartamento = r.cdepartamento
        ORDER BY d.xdepartamento, r.xrol`,
    );
    return res.recordset;
  }

  /** Plantilla de un rol (o la propia de un usuario). */
  async plantilla(cdepartamento: number, crol: number, cusuario?: number): Promise<ItemPlantilla[]> {
    const sql = this.mssql.types;
    const req = this.mssql
      .request()
      .input('cdepartamento', sql.Int, cdepartamento)
      .input('crol', sql.Int, crol);
    let filtroUsuario = 'AND cusuario IS NULL';
    if (cusuario) {
      req.input('cusuario', sql.Int, cusuario);
      filtroUsuario = 'AND cusuario = @cusuario';
    }
    const res = await req.query<ItemPlantilla>(
      `SELECT DISTINCT cmenuprincipal, cmenu
         FROM semenuparam
        WHERE cdepartamento = @cdepartamento AND crol = @crol AND istatus = 'V' ${filtroUsuario}
        ORDER BY cmenuprincipal, cmenu`,
    );
    return res.recordset;
  }

  /** Menú efectivo de un usuario (lo mismo que lee get-menu del backend de La Mundial). */
  async menuDeUsuario(cusuario: number) {
    const sql = this.mssql.types;
    const res = await this.mssql
      .request()
      .input('cusuario', sql.Int, cusuario)
      .query(
        `SELECT DISTINCT d.cmenuprincipal, LTRIM(RTRIM(mp.xmenu)) AS xmenuprincipal,
                d.cmenu, LTRIM(RTRIM(m.xmenu)) AS xmenu, LTRIM(RTRIM(m.xruta)) AS xruta
           FROM sedistribucionmenu d
          INNER JOIN semenuprincipal mp ON mp.cmenu_principal = d.cmenuprincipal
          INNER JOIN semenu m ON m.cmenu = d.cmenu AND m.cmenu_principal = d.cmenuprincipal
          WHERE d.cusuario = @cusuario AND ISNULL(d.istatus, 'V') = 'V'
          ORDER BY d.cmenuprincipal, d.cmenu`,
      );
    return res.recordset;
  }

  async guardarPrincipal(dto: GuardarPrincipalDto, operador: number, cmenuPrincipal?: number) {
    const sql = this.mssql.types;
    const res = await this.ejecutar('spMenuGuardarPrincipal', () =>
      this.mssql
        .request()
        .input('cmenu_principal', sql.Int, cmenuPrincipal ?? null)
        .input('xmenu', sql.VarChar(50), dto.xmenu)
        .input('xicono', sql.VarChar(50), dto.xicono ?? null)
        .input('xruta', sql.VarChar(250), dto.xruta ?? null)
        .input('istatus', sql.Char(1), dto.istatus ?? 'V')
        .input('cusuario', sql.Numeric(9, 0), operador)
        .execute('spMenuGuardarPrincipal'),
    );
    return { cmenu_principal: res.recordset?.[0]?.cmenu_principal as number };
  }

  async guardarOpcion(dto: GuardarOpcionDto, operador: number, cmenu?: number) {
    const sql = this.mssql.types;
    const res = await this.ejecutar('spMenuGuardarOpcion', () =>
      this.mssql
        .request()
        .input('cmenu', sql.Int, cmenu ?? null)
        .input('cmenu_principal', sql.Int, dto.cmenu_principal)
        .input('xmenu', sql.VarChar(100), dto.xmenu)
        .input('xruta', sql.VarChar(250), dto.xruta)
        .input('istatus', sql.Char(1), dto.istatus ?? 'V')
        .input('cusuario', sql.Numeric(9, 0), operador)
        .execute('spMenuGuardarOpcion'),
    );
    return { cmenu: res.recordset?.[0]?.cmenu as number };
  }

  async guardarPlantilla(dto: GuardarPlantillaDto, operador: number) {
    const sql = this.mssql.types;
    const menus = dto.menus.map((m) => ({ cmenuprincipal: m.cmenuprincipal, cmenu: m.cmenu ?? null }));
    const res = await this.ejecutar('spMenuGuardarPlantilla', () =>
      this.mssql
        .request()
        .input('cdepartamento', sql.Int, dto.cdepartamento)
        .input('crol', sql.Int, dto.crol)
        .input('cusuario', sql.Int, dto.cusuario ?? null)
        .input('menus', sql.NVarChar(sql.MAX), JSON.stringify(menus))
        .input('cusuario1', sql.Numeric(9, 0), operador)
        .input('aplicar_existentes', sql.Bit, dto.aplicarAExistentes === true)
        .execute('spMenuGuardarPlantilla'),
    );
    const fila = res.recordset?.[0] ?? {};
    return { opciones: fila.opciones ?? 0, usuarios: fila.usuarios ?? 0 };
  }

  async sincronizarUsuario(cusuario: number, operador: number) {
    const sql = this.mssql.types;
    const res = await this.ejecutar('spMenuSincronizarUsuario', () =>
      this.mssql
        .request()
        .input('cusuario', sql.Int, cusuario)
        .input('cusuario1', sql.Numeric(9, 0), operador)
        .execute('spMenuSincronizarUsuario'),
    );
    return { usuarios: res.recordset?.[0]?.usuarios ?? 0 };
  }

  /** Los THROW 99001 de los SPs son errores de validación (400); el resto, 500. */
  private async ejecutar<T>(sp: string, llamada: () => Promise<T>): Promise<T> {
    try {
      return await llamada();
    } catch (err) {
      const numero = (err as { number?: number })?.number;
      const mensaje = err instanceof Error ? err.message : String(err);
      if (numero === ERROR_NEGOCIO_SP) {
        throw new BadRequestException(mensaje);
      }
      this.logger.error(`Fallo ${sp}: ${mensaje}`);
      throw new InternalServerErrorException(`No fue posible completar la operación de menú: ${mensaje}`);
    }
  }
}
