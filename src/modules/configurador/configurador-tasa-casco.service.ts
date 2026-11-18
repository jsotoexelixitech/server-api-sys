import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotImplementedException,
} from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { parseSPError } from '../../common/helpers/sp-error.helper';
import { BANDERA_AUTO } from './configurador-auto.service';
import {
  AVISO_CASCO_GLOBAL, MENSAJE_CASCO_VALORES, SP_CASCO, estadoHttpCasco, filtrosJson, validarCrearVersion,
} from './configurador-tasa-casco';
import { errorSql, exigirBandera, existeSql, rtrim } from './configurador.comun';
import type {
  CancelarVersionCascoDto, CrearVersionCascoDto, RevisarVersionCascoDto, VistaPreviaCascoDto,
} from './dto/configurador-tasa-casco.dto';

type Fila = Record<string, unknown>;
const numOrNull = (v: unknown) => (v == null ? null : Number(v));
const texto = (v: unknown) => (v == null ? null : rtrim(v));

/** Llave de las tablas de casco, en el orden de la PK. */
const LLAVE = `RTRIM(cplan) AS cplan, RTRIM(ccober) AS ccober, ctipo, ccategotr, cuso, RTRIM(itipocalculo) AS itipocalculo`;

function numeroSql(err: unknown): number | undefined {
  const e = (err ?? {}) as { number?: number; originalError?: { info?: { number?: number } }; precedingErrors?: { number?: number }[] };
  return e.number ?? e.originalError?.info?.number ?? e.precedingErrors?.find((p) => p?.number)?.number;
}

/**
 * Tasa de casco por características (ramo 18; macalcasco, macobtipo, marangosum, marangoano). Lectura directa de las
 * tablas y del versionado (v_tarifa_casco_versiones, fn_tarifa_casco_version_vigente). Escritura SOLO con los SP del
 * tarificador de Sis2000 (ajustar, restaurar, revisar, cancelar), con CONFIGURADOR_AUTO_ESCRITURA; cada SP lleva su
 * transacción, applock, permisos (TARIFACASCO_ROL) y doble control. Grabar valores por celda: 501 (no hay SP).
 */
@Injectable()
export class ConfiguradorTasaCascoService {
  private readonly logger = new Logger(ConfiguradorTasaCascoService.name);

  constructor(private readonly db: MssqlService) {}

  /** Versión vigente, propuestas en curso y las tablas del ramo (qué planes calculan, rangos, tasas y factores). */
  async leer(cramo: number) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query(`
      SELECT ${LLAVE}, msumamin, RTRIM(msumamax) AS msumamax, crango FROM macalcasco WITH (NOLOCK) WHERE cramo = @cramo
        ORDER BY cplan, ccober, ctipo, cuso;
      SELECT ${LLAVE}, crango, msumamin, msumamax FROM marangosum WITH (NOLOCK) WHERE cramo = @cramo ORDER BY cplan, ccober, ctipo, cuso, crango;
      SELECT ${LLAVE}, msumamin, msumamax, crango, fano, ntasa FROM marangoano WITH (NOLOCK) WHERE cramo = @cramo
        ORDER BY cplan, ccober, ctipo, cuso, crango, fano;
      SELECT ${LLAVE}, RTRIM(xtipo) AS xtipo, nfactor FROM macobtipo WITH (NOLOCK) WHERE cramo = @cramo ORDER BY cplan, ccober, ctipo, cuso;
      SELECT CASE WHEN OBJECT_ID('dbo.tarifa_casco_versiones', 'U') IS NOT NULL AND OBJECT_ID('dbo.v_tarifa_casco_versiones', 'V') IS NOT NULL
                   AND OBJECT_ID('dbo.fn_tarifa_casco_version_vigente') IS NOT NULL THEN 1 ELSE 0 END AS versionado;`);
    const [planes, rangos, tasas, factores, disp] = r.recordsets as unknown as Fila[][];
    const llave = (f: Fila) => ({
      cplan: texto(f.cplan), ccober: texto(f.ccober), ctipo: Number(f.ctipo), ccategotr: Number(f.ccategotr), cuso: Number(f.cuso),
      itipocalculo: texto(f.itipocalculo),
    });
    const tablas = {
      planes: planes.map((f) => ({ ...llave(f), msumamin: numOrNull(f.msumamin), msumamax: texto(f.msumamax), crango: numOrNull(f.crango) })),
      rangos: rangos.map((f) => ({ ...llave(f), crango: Number(f.crango), msumamin: numOrNull(f.msumamin), msumamax: numOrNull(f.msumamax) })),
      tasas: tasas.map((f) => ({
        ...llave(f), msumamin: numOrNull(f.msumamin), msumamax: numOrNull(f.msumamax), crango: Number(f.crango), fano: Number(f.fano),
        ntasa: numOrNull(f.ntasa),
      })),
      factores: factores.map((f) => ({ ...llave(f), xtipo: texto(f.xtipo), nfactor: numOrNull(f.nfactor) })),
    };
    const avisos = [AVISO_CASCO_GLOBAL];
    if (!tablas.tasas.length && !tablas.factores.length) avisos.push(`El ramo ${cramo} no tiene tasa de casco por características (marangoano/macobtipo vacías).`);
    if (Number(disp[0]?.versionado) !== 1) {
      avisos.push('Esta base no tiene el versionado de la tasa de casco (tarifa_casco_versiones y sus SP): solo lectura.');
      return { cramo, versionado: false, requiereAprobacion: null, vigente: null, enCurso: [], ...tablas, avisos };
    }
    const v = await this.db.request().query(`
      SELECT v.* FROM dbo.v_tarifa_casco_versiones v
        WHERE v.id = (SELECT TOP 1 id FROM dbo.fn_tarifa_casco_version_vigente(CAST(GETDATE() AS DATE)));
      SELECT * FROM dbo.v_tarifa_casco_versiones WHERE estado IN ('PENDIENTE', 'APROBADA') ORDER BY numero;
      SELECT valor FROM dbo.v_tarifa_casco_parametros WHERE clave = 'REQUIERE_APROBACION';`);
    const [vig, curso, param] = v.recordsets as unknown as Fila[][];
    return {
      cramo,
      versionado: true,
      // Igual que sp_tarifa_casco_crear_version: solo '0' apaga la aprobación.
      requiereAprobacion: texto(param[0]?.valor) !== '0',
      vigente: vig[0] ?? null,
      enCurso: curso,
      ...tablas,
      avisos,
    };
  }

  /** Historial de versiones (más recientes primero; sin copia_valores). */
  async versiones(limit = 50) {
    const req = this.db.request();
    req.input('n', sql.Int, Math.min(Math.max(Math.trunc(limit) || 50, 1), 200));
    const r = await req.query('SELECT TOP (@n) * FROM dbo.v_tarifa_casco_versiones ORDER BY numero DESC');
    return r.recordset ?? [];
  }

  /** sp_tarifa_casco_vista_previa: resumen y detalle antes/después de un ajuste. No escribe (sin bandera). */
  async vistaPrevia(cramo: number, dto: VistaPreviaCascoDto) {
    await this.exigirCasco(cramo);
    const req = this.db.request();
    req.input('movimiento', sql.VarChar(11), dto.movimiento);
    req.input('porcentaje', sql.Decimal(5, 2), dto.porcentaje);
    req.input('alcance', sql.VarChar(20), dto.alcance);
    req.input('filtros', sql.NVarChar(sql.MAX), filtrosJson(dto.filtros));
    req.input('tipo_vehiculo', sql.SmallInt, dto.tipo_vehiculo ?? null);
    req.input('cobertura', sql.VarChar(4), dto.cobertura?.trim() || null);
    const r = await this.sp('ver la vista previa del ajuste de casco', () => req.execute(SP_CASCO.vistaPrevia));
    const [resumen, detalle] = r.recordsets as unknown as Fila[][];
    return { resumen: resumen?.[0] ?? null, detalle: detalle ?? [], avisos: [AVISO_CASCO_GLOBAL] };
  }

  /** Propuesta nueva: AJUSTE → sp_tarifa_casco_ajustar; RESTAURACION → sp_tarifa_casco_restaurar. Devuelve la versión creada. */
  async crearVersion(cramo: number, dto: CrearVersionCascoDto) {
    exigirBandera(BANDERA_AUTO, 'auto (tasa de casco)');
    const errores = validarCrearVersion(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await this.exigirCasco(cramo);
    const req = this.db.request();
    req.input('usuario_id', sql.Int, dto.cusuario);
    if (dto.origen === 'AJUSTE') {
      req.input('movimiento', sql.VarChar(11), dto.movimiento);
      req.input('porcentaje', sql.Decimal(5, 2), dto.porcentaje);
      req.input('alcance', sql.VarChar(20), dto.alcance);
      req.input('filtros', sql.NVarChar(sql.MAX), filtrosJson(dto.filtros));
    } else {
      req.input('version_id', sql.Int, dto.version_id);
    }
    req.input('vigente_desde', sql.Date, dto.vigente_desde ?? null);
    req.input('motivo', sql.NVarChar(500), dto.motivo);
    req.input('rige_al_aprobar', sql.Bit, dto.rige_al_aprobar ? 1 : 0);
    req.input('vigente_hasta', sql.Date, dto.vigente_hasta ?? null);
    const nombre = dto.origen === 'AJUSTE' ? SP_CASCO.ajustar : SP_CASCO.restaurar;
    const r = await this.sp(`proponer la ${dto.origen === 'AJUSTE' ? 'versión de ajuste' : 'restauración'} de casco`, () => req.execute(nombre));
    const version = (r.recordset?.[0] ?? null) as Fila | null;
    this.logger.warn(`tasa casco: ${nombre} por ${dto.cusuario} → versión ${version?.numero ?? '?'} (${version?.situacion ?? '?'})`);
    return { version, avisos: [AVISO_CASCO_GLOBAL] };
  }

  /** Sin SP para grabar valores por celda en una versión: 501 (ver MENSAJE_CASCO_VALORES). */
  grabarValores(): never {
    throw new NotImplementedException(MENSAJE_CASCO_VALORES);
  }

  /**
   * Publicar = aprobar la propuesta PENDIENTE con sp_tarifa_casco_revisar: si la fecha ya llegó se aplica en la misma
   * transacción; si es futura queda PROGRAMADA (la aplica la tarea de las 00:05). Doble control: quien aprueba no puede
   * ser quien propuso (THROW 50111 → 409).
   */
  async publicar(cramo: number, id: number, dto: RevisarVersionCascoDto) {
    return this.revisar(cramo, id, 'APROBAR', dto);
  }

  async rechazar(cramo: number, id: number, dto: RevisarVersionCascoDto) {
    return this.revisar(cramo, id, 'RECHAZAR', dto);
  }

  /** sp_tarifa_casco_cancelar: versión APROBADA que aún no se aplicó. */
  async cancelar(cramo: number, id: number, dto: CancelarVersionCascoDto) {
    exigirBandera(BANDERA_AUTO, 'auto (tasa de casco)');
    await this.exigirCasco(cramo);
    const req = this.db.request();
    req.input('usuario_id', sql.Int, dto.cusuario);
    req.input('version_id', sql.Int, id);
    req.input('motivo', sql.NVarChar(500), dto.motivo);
    const r = await this.sp('cancelar la versión de casco', () => req.execute(SP_CASCO.cancelar));
    this.logger.warn(`tasa casco: cancelada versión id ${id} por ${dto.cusuario}`);
    return { version: r.recordset?.[0] ?? null };
  }

  private async revisar(cramo: number, id: number, decision: 'APROBAR' | 'RECHAZAR', dto: RevisarVersionCascoDto) {
    exigirBandera(BANDERA_AUTO, 'auto (tasa de casco)');
    await this.exigirCasco(cramo);
    const req = this.db.request();
    req.input('usuario_id', sql.Int, dto.cusuario);
    req.input('version_id', sql.Int, id);
    req.input('decision', sql.VarChar(10), decision);
    req.input('comentario', sql.NVarChar(500), dto.comentario ?? null);
    const accion = decision === 'APROBAR' ? 'publicar (aprobar) la versión de casco' : 'rechazar la versión de casco';
    const r = await this.sp(accion, () => req.execute(SP_CASCO.revisar));
    const version = (r.recordset?.[0] ?? null) as Fila | null;
    this.logger.warn(`tasa casco: ${decision} versión id ${id} por ${dto.cusuario} → ${version?.situacion ?? '?'}`);
    return { version };
  }

  /** 400 si el ramo no tiene tasa de casco por características (el versionado es global, pero se entra por un ramo que la use). */
  private async exigirCasco(cramo: number) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const hay = await existeSql(req, `SELECT 1 FROM marangoano WITH (NOLOCK) WHERE cramo = @cramo
      UNION ALL SELECT 1 FROM macobtipo WITH (NOLOCK) WHERE cramo = @cramo`);
    if (!hay) throw new BadRequestException(`El ramo ${cramo} no tiene tasa de casco por características (marangoano/macobtipo).`);
  }

  /** Ejecuta un SP del tarificador y traduce sus THROW 501xx (403/409/400); el resto con errorSql. */
  private async sp<R>(accion: string, fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (err) {
      const estado = estadoHttpCasco(numeroSql(err));
      const msg = parseSPError(err) || `No se pudo ${accion}.`;
      if (estado === 403) throw new ForbiddenException(msg);
      if (estado === 409) throw new ConflictException(msg);
      if (estado === 400) throw new BadRequestException(msg);
      throw errorSql(this.logger, accion, err);
    }
  }
}
