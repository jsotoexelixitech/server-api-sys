import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import type { PortalLoginDto } from './dto/portal-login.dto';

type Row = Record<string, unknown>;

export type PortalCatalogo = {
  centidad: string;
  citem: string;
  cgestor: string | null;
  /** true → POST valrep/productos/marketplace con `filtrar_gestor` (equivale a SysIP products/obtener). */
  filtrar_gestor: boolean;
};

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * Login de usuarios Sis2000 para el portal La Mundial.
 * Réplica de SysIP `POST /api/v1/auth/signIn` (seusuariosweb + seVlogin + magestor), solo lectura.
 * No emite token de usuario: el portal (Nexus) crea su propia sesión con los datos devueltos.
 */
@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(private readonly db: MssqlService) {}

  async login(dto: PortalLoginDto) {
    const xlogin = dto.xlogin.trim();
    try {
      const T = this.db.types;

      const req = this.db.request();
      req.input('xlogin', T.NVarChar(100), xlogin);
      req.input('xcontrasena', T.NVarChar(100), dto.xcontrasena);
      const web = await req.query(`
        SELECT TOP 1
          cusuario, xusuario, xlogin, xcorreo, cusuariopadre, bcambioclave,
          CASE WHEN xcontrasena = @xcontrasena THEN 1 ELSE 0 END AS bclave_ok
        FROM seusuariosweb WITH (NOLOCK)
        WHERE xlogin = @xlogin
      `);
      const webRow = web.recordset?.[0] as Row | undefined;
      if (!webRow || Number(webRow['bclave_ok']) !== 1) {
        throw new UnauthorizedException('Usuario o contraseña inválidos.');
      }

      const reqUser = this.db.request();
      reqUser.input('xlogin', T.NVarChar(100), xlogin);
      const vlogin = await reqUser.query(
        'SELECT TOP 1 * FROM seVlogin WITH (NOLOCK) WHERE xlogin = @xlogin',
      );
      const user = vlogin.recordset?.[0] as Row | undefined;
      if (!user) {
        throw new UnauthorizedException('Usuario sin perfil activo en Sis2000.');
      }

      const xcorreo = str(webRow['xcorreo']);
      const gestor = xcorreo ? await this.findGestorByCorreo(xcorreo) : undefined;

      const cusuario = user['cusuario'] ?? webRow['cusuario'];
      const cdepartamento = Number(user['cdepartamento']);
      const cusuariopadre = webRow['cusuariopadre'] || null;
      const ccorredor = str(user['ccorredor']);
      const cgestor = str(gestor?.['cgestor']);
      const ccanalalt = str(gestor?.['ccanalalt']);

      // Misma prioridad que SysIP authController.createJWT
      let centidad = 'P';
      let citem: string | null = cgestor;
      if ((cdepartamento === 4 || cdepartamento === 11) && cusuariopadre && (ccorredor || ccanalalt)) {
        centidad = 'G';
        citem = str(cusuario);
      } else if (ccanalalt) {
        centidad = 'C';
        citem = ccanalalt;
      } else if (ccorredor) {
        centidad = 'P';
        citem = ccorredor;
      }

      const catalogo = await this.resolveCatalogo(centidad, citem, gestor);

      return {
        usuario: {
          cusuario,
          xusuario: str(user['xusuario'] ?? webRow['xusuario']),
          xlogin: str(user['xlogin']) ?? xlogin,
          xcorreo,
          bcambioclave: webRow['bcambioclave'] ?? null,
          cdepartamento: user['cdepartamento'] ?? null,
          crol: user['crol'] ?? null,
          bcrear: user['bcrear'] ?? null,
          bconsultar: user['bconsultar'] ?? null,
          bmodificar: user['bmodificar'] ?? null,
          beliminar: user['beliminar'] ?? null,
          cnivel: user['cnivel'] ?? null,
          centidad,
          citem,
          ccorredor,
          xcorredor: str(user['xcorredor']),
          cgestor,
          ccanalalt,
          cscanalalt: str(gestor?.['cscanalalt']),
        },
        catalogo,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`portal login xlogin=${xlogin}: ${msg}`);
      throw new InternalServerErrorException('Error al validar usuario en Sis2000.');
    }
  }

  private async findGestorByCorreo(xcorreo: string): Promise<Row | undefined> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('xcorreo', T.NVarChar(200), xcorreo);
    const result = await req.query(`
      SELECT TOP 1
        LTRIM(RTRIM(cgestor)) AS cgestor, ccanalalt, cscanalalt, ctipocanal, bactivo,
        CASE
          WHEN CHARINDEX('-', LTRIM(RTRIM(cgestor))) > 0
            THEN LEFT(LTRIM(RTRIM(cgestor)), CHARINDEX('-', LTRIM(RTRIM(cgestor))) - 1)
          ELSE LTRIM(RTRIM(cgestor))
        END AS cproductor_gestor
      FROM magestor WITH (NOLOCK)
      WHERE xcorreo = @xcorreo
    `);
    return result.recordset?.[0] as Row | undefined;
  }

  /**
   * Entidad con la que el marketplace carga productos.
   * Gestor (G): como SysIP `valrep/gestor` → canal (C) o productor (P) + filtro products/obtener.
   */
  private async resolveCatalogo(
    centidad: string,
    citem: string | null,
    gestor: Row | undefined,
  ): Promise<PortalCatalogo | null> {
    if (centidad !== 'G') {
      return citem ? { centidad, citem, cgestor: null, filtrar_gestor: false } : null;
    }

    const cgestor = str(gestor?.['cgestor']);
    const cproductor = str(gestor?.['cproductor_gestor']);
    if (!gestor || !cgestor || !gestor['bactivo'] || !cproductor || !/^\d+$/.test(cproductor)) {
      return null;
    }

    const T = this.db.types;
    const req = this.db.request();
    req.input('cproductor', T.Int, Number(cproductor));
    const prod = await req.query(
      'SELECT TOP 1 istatpro FROM maproduc WITH (NOLOCK) WHERE cproductor = @cproductor',
    );
    if (str(prod.recordset?.[0]?.['istatpro']) !== 'V') return null;

    const ccanalalt = str(gestor['ccanalalt']);
    if (!ccanalalt) {
      return { centidad: 'P', citem: cproductor, cgestor, filtrar_gestor: true };
    }
    if (!/^\d+$/.test(ccanalalt)) return null;

    const reqCanal = this.db.request();
    reqCanal.input('ccanalalt', T.Int, Number(ccanalalt));
    const canal = await reqCanal.query(
      'SELECT TOP 1 ccanalalt FROM macanalalt WITH (NOLOCK) WHERE ccanalalt = @ccanalalt AND bactivo = 1',
    );
    if (!canal.recordset?.length) return null;
    return { centidad: 'C', citem: ccanalalt, cgestor, filtrar_gestor: true };
  }
}
