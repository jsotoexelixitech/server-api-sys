import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { validarPlan, validarProveedorPlan, validarTramos } from './configurador.reglas';
import { reconstruirPlan, type FilasPlan, type PlanLeido } from './configurador.plan-lectura';
import { familiaDelRamo, seccionesDeFamilia, type FamiliaRamo } from './configurador.familia';
import { bfradedBd, traeDeducible, validarDeducible, validarEdicionDetalle } from './configurador.deducibles';
import {
  CPROG, CUSUARIO, SQL_CONFLICTO, SQL_NO_EXISTE, SQL_VERSION_VIGENTE, errorSql, exigirBandera, lote, rtrim, throwSql, type TipoSql,
} from './configurador.comun';
import {
  BajaProveedorPlanDto, CanalesPlanDto, CrearCoberturaDto, CrearDetalleTarifaDto, CrearProductoDto, CrearTablaEdadDto, CrearTarifaDto,
  DeducibleCoberturaPlanDto, DetalleTarifaDto, EditarCoberturaDto, EditarDetalleTarifaDto, EditarProveedorPlanDto, EditarTarifaDto,
  PlanDto, ProveedorPlanDto, TramoEdadDto,
} from './dto/configurador.dto';

/** Bandera de escritura de deducibles (detalle de tarifa y cobertura del plan). Apagada por defecto. */
export const BANDERA_DEDUCIBLES = 'CONFIGURADOR_DEDUCIBLES_ESCRITURA';

/**
 * Escritura de proveedores del plan (maplprov_per). Apagada por defecto: no hay SP de mantenimiento conocido y la
 * estructura de la tabla (clave y columnas de auditoría) falta confirmarla en Sis2000_QA. Se enciende con
 * CONFIGURADOR_PROVEEDORES_ESCRITURA=1. La lectura siempre está disponible.
 */
export const proveedoresEscrituraHabilitada = () =>
  ['1', 'true', 'si', 'sí'].includes(String(process.env.CONFIGURADOR_PROVEEDORES_ESCRITURA ?? '').trim().toLowerCase());

/**
 * Alta de productos en Sis2000 (sp_CrearProducto, SP de La Mundial). Apagada por defecto; se enciende con
 * CONFIGURADOR_PRODUCTOS_ESCRITURA=1. La lectura de ramos siempre está disponible.
 */
export const productosEscrituraHabilitada = () =>
  ['1', 'true', 'si', 'sí'].includes(String(process.env.CONFIGURADOR_PRODUCTOS_ESCRITURA ?? '').trim().toLowerCase());

/** Columnas de maplprov_per que el configurador escribe siempre (las que usa sp_registrar_proveedor_poliza_nexus). */
const COLUMNAS_PROVEEDOR_PLAN = ['cramo', 'cplan', 'cci_rif', 'cclave_num', 'fdesde', 'fhasta', 'itiposerv', 'mcosto', 'mcostoext', 'cmoneda'];
/** Auditoría estándar de Sis2000: se escribe solo si la columna existe en maplprov_per. */
const AUDITORIA_ALTA: Array<[string, string]> = [
  ['u_version', "'!'"], ['cprog', '@cprog'], ['ifuente', '@ifuente'], ['fingreso', 'GETDATE()'], ['cusuario', '@cusuario'], ['ccategoria', '1'],
];
const AUDITORIA_MOD: Array<[string, string]> = [['fultmod', 'GETDATE()'], ['cusuariomod', '@cusuario'], ['ccategoriamod', '1']];
/** Columnas de maclient_prov que el catálogo puede mostrar (si existen); el resto no sale de Sis2000. */
const COLUMNAS_CATALOGO_PROVEEDOR = ['cclave_num', 'xclave', 'xdescripcion', 'itiposerv', 'iestado', 'bactivo'];

/** ifuente de las altas anteriores a la fase 1 (coberturas, tarifas, tablas de edad); las nuevas usan IFUENTE_SQL. */
const IFUENTE = 'NEXUS';

/** maramos con los indicadores de familia (tipos de auto, iplanpers, planes de personas). Termina sin WHERE/ORDER. */
const SQL_RAMOS_FAMILIA = `
  SELECT r.cramo, LTRIM(RTRIM(r.xdescripcion_l)) AS xdescripcion, r.iplanpers,
    CASE WHEN EXISTS (SELECT 1 FROM matipos t WITH (NOLOCK) WHERE t.cramo = r.cramo)
           OR EXISTS (SELECT 1 FROM macattip a WITH (NOLOCK) WHERE a.cramo = r.cramo) THEN 1 ELSE 0 END AS tiene_auto,
    CASE WHEN EXISTS (SELECT 1 FROM maplanes_per p WITH (NOLOCK) WHERE p.cramo = r.cramo) THEN 1 ELSE 0 END AS tiene_personas
  FROM maramos r WITH (NOLOCK)`;

const familiaDeFila = (f: Record<string, unknown>) =>
  familiaDelRamo({ tieneTiposAuto: Number(f.tiene_auto) === 1, iplanpers: f.iplanpers, tienePlanesPersonas: Number(f.tiene_personas) === 1 });

/**
 * Sentencias para agregar n canales al plan en mausuplan (parámetros @cramo, @cplan, @it0..@itN-1; @id y @nuevos
 * declarados antes). Solo INSERT si la fila no está; no hay DELETE ni UPDATE.
 */
export function sentenciasCanalesPlan(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `IF NOT EXISTS (SELECT 1 FROM mausuplan WHERE cramo = @cramo AND cplan = @cplan
  AND centidad = 'C' AND itipouso = 'A' AND ((@it${i} IS NULL AND citem IS NULL) OR citem = @it${i}))
BEGIN
  SET @id = @id + 1;
  INSERT INTO mausuplan (id, centidad, citem, cramo, cplan, u_version, itipouso) VALUES (@id, 'C', @it${i}, @cramo, @cplan, '!', 'A');
  INSERT INTO @nuevos (citem) VALUES (@it${i});
END`);
}

/**
 * Configurador de productos en Sis2000 (lo usa proyecto-product-builder). Coberturas, tarifas y tablas de tasas por
 * edad con SQL propio; planes con spMantPlanes (llena maplanes, maplantar, maplanes_frec, maplcober_per,
 * mapltarifas_per, mapledades_per y mausuplan). No crea ni modifica SPs. Nada se borra salvo planes: coberturas y
 * tarifas se inactivan (iestado I).
 */
@Injectable()
export class ConfiguradorService {
  private readonly logger = new Logger(ConfiguradorService.name);

  constructor(private readonly db: MssqlService) {}

  // ── Ramos y productos ──────────────────────────────────────────────────────

  /** Ramos de Sis2000 (maramos) con su familia (auto, personas o cosas) — solo lectura. */
  async listarRamos() {
    const r = await this.db.request().query(`${SQL_RAMOS_FAMILIA} ORDER BY r.cramo`);
    return ((r.recordset ?? []) as Record<string, unknown>[]).map((f) => ({
      cramo: Number(f.cramo), xdescripcion: rtrim(f.xdescripcion), familia: familiaDeFila(f),
    }));
  }

  /** Un ramo con su familia y las secciones del configurador que aplican (orden fijo). 404 si no existe. */
  async obtenerRamo(cramo: number): Promise<{ cramo: number; xdescripcion_l: string; familia: FamiliaRamo; secciones: string[] }> {
    const familia = await this.familiaDeRamo(cramo);
    return { ...familia, secciones: seccionesDeFamilia(familia.familia) };
  }

  /** Familia de un ramo (también la usan los services de comisiones, auto y revisión). */
  async familiaDeRamo(cramo: number): Promise<{ cramo: number; xdescripcion_l: string; familia: FamiliaRamo }> {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query(`${SQL_RAMOS_FAMILIA} WHERE r.cramo = @cramo`);
    const f = r.recordset?.[0] as Record<string, unknown> | undefined;
    if (!f) throw new NotFoundException(`No existe el ramo ${cramo}.`);
    return { cramo, xdescripcion_l: rtrim(f.xdescripcion), familia: familiaDeFila(f) };
  }

  /**
   * Crea un producto con sp_CrearProducto (SP de La Mundial; aquí no se crea ni modifica). Solo alta: sp_ActualizarProducto
   * no se usa (pone NULL en los campos que no recibe). El SP devuelve una fila status (1/0), message, cproducto.
   */
  async crearProducto(dto: CrearProductoDto) {
    if (!productosEscrituraHabilitada()) {
      throw new ForbiddenException(
        'La escritura de productos está desactivada en este ambiente (CONFIGURADOR_PRODUCTOS_ESCRITURA=1 para habilitarla).',
      );
    }
    const cproducto = dto.cproducto.trim();
    const nombre = dto.xdescripcion_l.trim();
    await this.exigirRamo(dto.cramo);
    const req = this.db.request();
    req.input('cproducto', sql.Char(40), cproducto);
    req.input('cramo', sql.Numeric(5, 0), dto.cramo);
    req.input('xdescripcion_l', sql.Char(60), nombre);
    req.input('xdescripcion_c', sql.Char(15), (dto.xdescripcion_c?.trim() || nombre).slice(0, 15));
    if (dto.xabreviatura?.trim()) req.input('xabreviatura', sql.Char(5), dto.xabreviatura.trim());
    req.input('iproductor', sql.Bit, dto.iproductor ?? true);
    req.input('icanal', sql.Bit, dto.icanal ?? true);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    if (dto.ctiporamo !== undefined && dto.ctiporamo !== null) req.input('ctiporamo', sql.Int, dto.ctiporamo);
    if (dto.xdescripcion_prod?.trim()) req.input('xdescripcion_prod', sql.VarChar(150), dto.xdescripcion_prod.trim());
    const r = await this.escribir('crear producto', () => req.execute('sp_CrearProducto'));
    const fila = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    const mensaje = rtrim(fila.message ?? fila.mensaje);
    if (!(fila.status === true || Number(fila.status) === 1)) {
      this.logger.error(`sp_CrearProducto ${cproducto} ramo ${dto.cramo}: ${JSON.stringify(fila)}`);
      throw new BadRequestException(mensaje || 'sp_CrearProducto rechazó el producto.');
    }
    this.logger.log(`sp_CrearProducto ${cproducto} ramo ${dto.cramo}: creado`);
    return { cproducto: rtrim(fila.cproducto) || cproducto, cramo: dto.cramo, message: mensaje || 'Producto creado.' };
  }

  // ── Productores ────────────────────────────────────────────────────────────

  /** Productores (maproduc) — solo lectura; TOP 30 filtrados por nombre o código. */
  async listarProductores(q: string) {
    const texto = (q ?? '').trim().slice(0, 60);
    const req = this.db.request();
    req.input('q', sql.VarChar(60), texto);
    req.input('q2', sql.VarChar(62), `%${texto}%`);
    const r = await req.query(`
      SELECT TOP (30) cproductor, LTRIM(RTRIM(xproductor)) AS xproductor
      FROM maproduc WITH (NOLOCK)
      WHERE (@q = '' OR xproductor LIKE @q2 OR CONVERT(VARCHAR(20), cproductor) LIKE @q2)
      ORDER BY xproductor`);
    return r.recordset ?? [];
  }

  // ── Canales alternos ───────────────────────────────────────────────────────

  /**
   * Canales alternos activos (macanalalt, bactivo = 1) — solo lectura; TOP 50 filtrados por nombre o código.
   * En mausuplan el canal va con centidad 'C' y citem = ccanalalt (spBuscaPlan lo valida contra macanalalt).
   */
  async listarCanales(q: string) {
    const texto = (q ?? '').trim().slice(0, 60);
    const req = this.db.request();
    req.input('q', sql.VarChar(60), texto);
    req.input('q2', sql.VarChar(62), `%${texto}%`);
    const r = await req.query(`
      SELECT TOP (50) ccanalalt, LTRIM(RTRIM(xcanalalt)) AS xcanalalt, LTRIM(RTRIM(ctipocanal)) AS ctipocanal
      FROM macanalalt WITH (NOLOCK)
      WHERE bactivo = 1 AND (@q = '' OR xcanalalt LIKE @q2 OR CONVERT(VARCHAR(20), ccanalalt) LIKE @q2)
      ORDER BY xcanalalt`);
    return r.recordset ?? [];
  }

  // ── Coberturas ─────────────────────────────────────────────────────────────

  /** Incluye reaseguro (ccontrea, cramorea, cramopcnd) para que el configurador lo respalde antes de editar. */
  async listarCoberturas(cramo: number) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query(`
      SELECT cramo, RTRIM(ccobertura) AS ccobertura, RTRIM(xdescripcion_l) AS xdescripcion_l,
             RTRIM(xdescripcion_c) AS xdescripcion_c, RTRIM(xabreviatura) AS xabreviatura, bobligatoria,
             RTRIM(cmoneda) AS cmoneda, isuma, RTRIM(isumarecibo) AS isumarecibo, iestado, cramoint, ccoberturaint,
             ccontrea, cramorea, cramopcnd
      FROM macoberturas WITH (NOLOCK) WHERE cramo = @cramo
      ORDER BY TRY_CAST(RTRIM(ccobertura) AS INT), ccobertura`);
    return r.recordset ?? [];
  }

  async crearCobertura(dto: CrearCoberturaDto) {
    await this.exigirRamo(dto.cramo);
    if (await this.existe('SELECT 1 FROM macoberturas WHERE cramo = @cramo AND ccobertura = @ccob', { cramo: dto.cramo, ccob: dto.ccobertura })) {
      throw new ConflictException(`La cobertura ${dto.ccobertura} ya existe en el ramo ${dto.cramo}.`);
    }
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, dto.cramo);
    req.input('ccob', sql.Char(4), dto.ccobertura.trim());
    req.input('xl', sql.Char(60), dto.xdescripcion_l.trim());
    req.input('xc', sql.Char(15), (dto.xdescripcion_c ?? dto.xdescripcion_l).trim().slice(0, 15));
    req.input('xab', sql.Char(5), (dto.xabreviatura ?? '').trim() || null);
    req.input('oblig', sql.Bit, dto.bobligatoria ?? false);
    req.input('ccontrea', sql.SmallInt, dto.ccontrea ?? null);
    req.input('cramorea', sql.SmallInt, dto.cramorea ?? null);
    req.input('cramopcnd', sql.SmallInt, dto.cramopcnd ?? dto.cramorea ?? null);
    req.input('cramoint', sql.SmallInt, dto.cramoint ?? null);
    req.input('ccoberint', sql.SmallInt, dto.ccoberturaint ?? null);
    req.input('cmoneda', sql.Char(4), dto.cmoneda ?? '$');
    req.input('isuma', sql.Char(1), dto.isuma ?? 'S');
    req.input('isumarec', sql.Char(1), dto.isumarecibo ?? 'S');
    this.auditoria(req);
    await this.escribir('crear cobertura', () => req.query(`
      INSERT INTO macoberturas (cramo, ccobertura, u_version, xdescripcion_l, xdescripcion_c, xabreviatura, brutcal, bprocent,
        bprocsal, bobligatoria, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint, ccoberturaint, cmoneda, isuma, isumarecibo,
        ccobercomp, iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
      VALUES (@cramo, @ccob, '!', @xl, @xc, @xab, 1, 0, 0, @oblig, @ccontrea, @cramorea, @cramopcnd, '0', @cramoint, @ccoberint,
        @cmoneda, @isuma, @isumarec, '0', 'V', @cprog, @ifuente, GETDATE(), @cusuario, 1)`));
    return { cramo: dto.cramo, ccobertura: dto.ccobertura.trim() };
  }

  async editarCobertura(cramo: number, ccobertura: string, dto: EditarCoberturaDto) {
    const sets: string[] = [];
    const req = this.db.request();
    if (dto.xdescripcion_l !== undefined) { sets.push('xdescripcion_l = @xl'); req.input('xl', sql.Char(60), dto.xdescripcion_l.trim()); }
    if (dto.xdescripcion_c !== undefined) { sets.push('xdescripcion_c = @xc'); req.input('xc', sql.Char(15), dto.xdescripcion_c.trim()); }
    if (dto.xabreviatura !== undefined) { sets.push('xabreviatura = @xab'); req.input('xab', sql.Char(5), dto.xabreviatura.trim()); }
    if (dto.bobligatoria !== undefined) { sets.push('bobligatoria = @oblig'); req.input('oblig', sql.Bit, dto.bobligatoria); }
    if (dto.iestado !== undefined) { sets.push('iestado = @iestado'); req.input('iestado', sql.Char(1), dto.iestado); }
    if (dto.ccontrea !== undefined) { sets.push('ccontrea = @ccontrea'); req.input('ccontrea', sql.SmallInt, dto.ccontrea); }
    if (dto.cramorea !== undefined) { sets.push('cramorea = @cramorea'); req.input('cramorea', sql.SmallInt, dto.cramorea); }
    if (dto.cramopcnd !== undefined) { sets.push('cramopcnd = @cramopcnd'); req.input('cramopcnd', sql.SmallInt, dto.cramopcnd); }
    if (!sets.length) throw new BadRequestException('No hay campos para actualizar.');
    req.input('cramo', sql.SmallInt, cramo);
    req.input('ccob', sql.Char(4), ccobertura.trim());
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const r = await this.escribir('editar cobertura', () => req.query(`
      UPDATE macoberturas SET ${sets.join(', ')}, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
      WHERE cramo = @cramo AND ccobertura = @ccob`));
    if (!r.rowsAffected[0]) throw new NotFoundException(`No existe la cobertura ${ccobertura} en el ramo ${cramo}.`);
    return { cramo, ccobertura: ccobertura.trim() };
  }

  // ── Tarifas ────────────────────────────────────────────────────────────────

  async listarTarifas(cramo: number, ccober: string) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('ccob', sql.Char(4), ccober.trim());
    const r = await req.query(`
      SELECT RTRIM(ctarifa) AS ctarifa, RTRIM(xtarifam) AS xtarifam, RTRIM(xtarifa) AS xtarifa, bobligatoria, iestado
      FROM matarifa WITH (NOLOCK) WHERE cramo = @cramo AND ccober = @ccob ORDER BY ctarifa;
      SELECT RTRIM(ctarifa) AS ctarifa, CONVERT(varchar(10), fdesde, 23) AS fdesde, CONVERT(varchar(10), fhasta, 23) AS fhasta,
             msumamin, msumamax, mprima, pprima, iestado
      FROM matarifa_d WITH (NOLOCK) WHERE cramo = @cramo AND ccober = @ccob ORDER BY ctarifa, fdesde DESC;`);
    const [tarifas, detalles] = r.recordsets as unknown as Record<string, unknown>[][];
    return tarifas.map((t) => ({ ...t, detalles: detalles.filter((d) => d.ctarifa === t.ctarifa) }));
  }

  async crearTarifa(dto: CrearTarifaDto) {
    if ((dto.detalles?.length ?? 0) > 1) {
      throw new BadRequestException(
        "Una tarifa lleva un solo detalle 'V' en matarifa_d (la emisión no filtra vigencias): envía uno; para cambiar la tasa después, " +
          'inactiva el vigente (PATCH tarifas/:cramo/:ccober/:ctarifa/detalles/:fdesde) y agrega el nuevo.',
      );
    }
    this.exigirDeducibles(dto.detalles ?? []);
    await this.exigirCobertura(dto.cramo, dto.ccober);
    const claves = { cramo: dto.cramo, ccob: dto.ccober, ctar: dto.ctarifa };
    if (await this.existe('SELECT 1 FROM matarifa WHERE cramo = @cramo AND ccober = @ccob AND ctarifa = @ctar', claves)) {
      throw new ConflictException(`La tarifa ${dto.ctarifa} ya existe para la cobertura ${dto.ccober} del ramo ${dto.cramo}.`);
    }
    const req = this.db.request();
    this.claveTarifa(req, dto);
    req.input('xtm', sql.Char(15), dto.xtarifam.trim());
    req.input('xt', sql.Char(60), (dto.xtarifa ?? dto.xtarifam).trim());
    req.input('xab', sql.Char(5), (dto.xabrev ?? '').trim() || null);
    req.input('oblig', sql.Char(1), dto.bobligatoria ? 'T' : '0');
    this.auditoria(req);
    // Ramo y cobertura internos se copian de macoberturas, como en las tarifas existentes.
    const sentencias = [`
      INSERT INTO matarifa (cramo, ccober, ctarifa, u_version, ctarifdepe, xtarifa, xtarifam, xabrev, bfija, bpertotal,
        bobligatoria, bprocent, bprocsal, isuma, brutcal, cramoint, ccoberturaint, ctarifaint, qordenimp, ietiqtarimp, bprimarea,
        iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
      SELECT @cramo, @ccob, @ctar, '!', '0', @xt, @xtm, @xab, '0', '0', @oblig, '0', '0', 'S', 1, c.cramoint, c.ccoberturaint,
        TRY_CAST(RTRIM(@ctar) AS SMALLINT), 0, 'C', 0, 'V', @cprog, @ifuente, GETDATE(), @cusuario, 1
      FROM macoberturas c WHERE c.cramo = @cramo AND c.ccobertura = @ccob;`];
    (dto.detalles ?? []).forEach((d, i) => sentencias.push(this.sqlDetalle(req, d, i)));
    await this.escribir('crear tarifa', () => req.query(lote(sentencias)));
    return { cramo: dto.cramo, ccober: dto.ccober.trim(), ctarifa: dto.ctarifa.trim(), detalles: dto.detalles?.length ?? 0 };
  }

  /** Agrega un detalle 'V'. 409 si la tarifa ya tiene uno 'V' (nunca dos filas vigentes para la misma tarifa). */
  async crearDetalleTarifa(dto: CrearDetalleTarifaDto) {
    this.exigirDeducibles([dto]);
    const claves = { cramo: dto.cramo, ccob: dto.ccober, ctar: dto.ctarifa };
    if (!(await this.existe('SELECT 1 FROM matarifa WHERE cramo = @cramo AND ccober = @ccob AND ctarifa = @ctar', claves))) {
      throw new NotFoundException(`No existe la tarifa ${dto.ctarifa} de la cobertura ${dto.ccober} del ramo ${dto.cramo}.`);
    }
    const req = this.db.request();
    this.claveTarifa(req, dto);
    this.auditoria(req);
    const insert = this.sqlDetalle(req, dto, 0);
    await this.escribir('crear detalle de tarifa', () => req.query(lote([
      `IF EXISTS (SELECT 1 FROM matarifa_d WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND ccober = @ccob AND ctarifa = @ctar AND iestado = 'V')`,
      throwSql(SQL_CONFLICTO, "La tarifa ya tiene un detalle 'V' en matarifa_d: inactiva el vigente (iestado I) antes de agregar otro."),
      insert,
    ])));
    return { cramo: dto.cramo, ccober: dto.ccober.trim(), ctarifa: dto.ctarifa.trim(), fdesde: dto.fdesde };
  }

  /**
   * Edita un detalle de tarifa (matarifa_d) identificado por su fdesde (fecha): tasa, prima, sumas, deducible, cierre
   * de vigencia (fhasta) o estado. Al reactivar ('V') responde 409 si otra fila de la tarifa ya está 'V'.
   */
  async editarDetalleTarifa(cramo: number, ccober: string, ctarifa: string, fdesde: string, dto: EditarDetalleTarifaDto) {
    exigirBandera(BANDERA_DEDUCIBLES, 'deducibles y detalles de tarifa');
    this.exigirReglas([...validarDeducible(dto), ...validarEdicionDetalle(fdesde, dto)]);
    const sets: string[] = [];
    const req = this.db.request();
    const num = (col: string, tipo: TipoSql, v: number | null | undefined) => {
      if (v === undefined) return;
      sets.push(`${col} = @${col}`);
      req.input(col, tipo, v);
    };
    num('pprima', sql.Numeric(13, 6), dto.pprima);
    num('mprima', sql.Numeric(17, 2), dto.mprima);
    num('msumamin', sql.Numeric(17, 2), dto.msumamin);
    num('msumamax', sql.Numeric(17, 2), dto.msumamax);
    num('mdedu_fran', sql.Numeric(17, 2), dto.mdedu_fran);
    num('mdedu_franext', sql.Numeric(17, 2), dto.mdedu_franext);
    num('pdedu_fran', sql.Numeric(13, 6), dto.pdedu_fran);
    if (dto.bfraded !== undefined) { sets.push('bfraded = @bfraded'); req.input('bfraded', sql.Char(1), bfradedBd(dto.bfraded)); }
    if (dto.fhasta !== undefined) { sets.push('fhasta = @fhasta'); req.input('fhasta', sql.Date, dto.fhasta); }
    if (dto.iestado !== undefined) { sets.push('iestado = @iestado'); req.input('iestado', sql.Char(1), dto.iestado); }
    if (!sets.length) throw new BadRequestException('No hay campos para actualizar.');
    this.claveTarifa(req, { cramo, ccober, ctarifa });
    req.input('fdesde', sql.Date, fdesde);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const donde = 'cramo = @cramo AND ccober = @ccob AND ctarifa = @ctar';
    const sentencias = [
      `DECLARE @n INT = (SELECT COUNT(*) FROM matarifa_d WITH (UPDLOCK, HOLDLOCK) WHERE ${donde} AND CONVERT(date, fdesde) = @fdesde);`,
      'IF @n = 0',
      throwSql(SQL_NO_EXISTE, `No existe el detalle ${fdesde} de la tarifa ${ctarifa.trim()} (cobertura ${ccober.trim()}, ramo ${cramo}).`),
      'IF @n > 1',
      throwSql(SQL_CONFLICTO, `Hay más de un detalle de la tarifa ${ctarifa.trim()} con fecha ${fdesde}: corrígelo en Sis2000.`),
    ];
    if (dto.iestado === 'V') {
      sentencias.push(
        `IF EXISTS (SELECT 1 FROM matarifa_d WITH (UPDLOCK, HOLDLOCK) WHERE ${donde} AND iestado = 'V' AND CONVERT(date, fdesde) <> @fdesde)`,
        throwSql(SQL_CONFLICTO, `La tarifa ${ctarifa.trim()} ya tiene otro detalle 'V': inactívalo antes de reactivar este.`),
      );
    }
    sentencias.push(`UPDATE matarifa_d SET ${sets.join(', ')}, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
      WHERE ${donde} AND CONVERT(date, fdesde) = @fdesde;`);
    await this.escribir('editar detalle de tarifa', () => req.query(lote(sentencias)));
    return { cramo, ccober: ccober.trim(), ctarifa: ctarifa.trim(), fdesde };
  }

  /**
   * Deducible y desembolso máximo de una cobertura del plan en maplancob (versión vigente del plan: MAX fdesde_plan 'V'
   * en maplanes; dentro de ella, la fila de la cobertura con fdesde_cob más reciente). Solo planes de cosas/auto:
   * los de personas no usan maplancob.
   */
  async editarCoberturaPlan(cramo: number, cplan: string, ccobertura: string, dto: DeducibleCoberturaPlanDto) {
    exigirBandera(BANDERA_DEDUCIBLES, 'deducibles');
    this.exigirReglas(validarDeducible(dto));
    const sets: string[] = [];
    const req = this.db.request();
    const num = (col: string, tipo: TipoSql, v: number | null | undefined) => {
      if (v === undefined) return;
      sets.push(`${col} = @${col}`);
      req.input(col, tipo, v);
    };
    num('mdedu_fran', sql.Numeric(17, 2), dto.mdedu_fran);
    num('mdedu_franext', sql.Numeric(17, 2), dto.mdedu_franext);
    num('pdedu_fran', sql.Numeric(13, 6), dto.pdedu_fran);
    num('mmax_desem', sql.Numeric(17, 2), dto.mmax_desem);
    num('mmax_desemext', sql.Numeric(17, 2), dto.mmax_desemext);
    if (dto.bfraded !== undefined) { sets.push('bfraded = @bfraded'); req.input('bfraded', sql.Char(1), bfradedBd(dto.bfraded)); }
    if (!sets.length) throw new BadRequestException('No hay campos para actualizar.');
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    req.input('ccob', sql.Char(4), ccobertura.trim());
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const r = await this.escribir('editar el deducible de la cobertura del plan', () => req.query(lote([
      `DECLARE @vig DATETIME = ${SQL_VERSION_VIGENTE('maplanes')};`,
      'IF @vig IS NULL',
      throwSql(SQL_NO_EXISTE, `El plan ${cplan.trim()} no tiene versión 'V' en maplanes del ramo ${cramo} (los planes de personas no usan maplancob).`),
      `DECLARE @cob DATETIME = (SELECT MAX(fdesde_cob) FROM maplancob WITH (UPDLOCK, HOLDLOCK)
        WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccobertura = @ccob);`,
      'IF @cob IS NULL',
      throwSql(SQL_NO_EXISTE, `La cobertura ${ccobertura.trim()} no está en maplancob de la versión vigente del plan ${cplan.trim()}.`),
      `UPDATE maplancob SET ${sets.join(', ')}, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
        WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccobertura = @ccob AND fdesde_cob = @cob;`,
    ]) + '\nSELECT CONVERT(varchar(10), @vig, 23) AS fdesde_plan, CONVERT(varchar(10), @cob, 23) AS fdesde_cob;'));
    const f = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    return { cramo, cplan: cplan.trim(), ccobertura: ccobertura.trim(), fdesde_plan: rtrim(f.fdesde_plan), fdesde_cob: rtrim(f.fdesde_cob) };
  }

  /** Deducibles al crear tarifa/detalle: reglas siempre; si traen datos de deducible, exige la bandera. */
  private exigirDeducibles(detalles: DetalleTarifaDto[]) {
    this.exigirReglas(detalles.flatMap((d) => validarDeducible(d)));
    if (detalles.some((d) => traeDeducible(d))) exigirBandera(BANDERA_DEDUCIBLES, 'deducibles');
  }

  async editarTarifa(cramo: number, ccober: string, ctarifa: string, dto: EditarTarifaDto) {
    const sets: string[] = [];
    const req = this.db.request();
    if (dto.xtarifam !== undefined) { sets.push('xtarifam = @xtm'); req.input('xtm', sql.Char(15), dto.xtarifam.trim()); }
    if (dto.xtarifa !== undefined) { sets.push('xtarifa = @xt'); req.input('xt', sql.Char(60), dto.xtarifa.trim()); }
    if (dto.bobligatoria !== undefined) { sets.push('bobligatoria = @oblig'); req.input('oblig', sql.Char(1), dto.bobligatoria ? 'T' : '0'); }
    if (dto.iestado !== undefined) { sets.push('iestado = @iestado'); req.input('iestado', sql.Char(1), dto.iestado); }
    if (!sets.length) throw new BadRequestException('No hay campos para actualizar.');
    this.claveTarifa(req, { cramo, ccober, ctarifa });
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const r = await this.escribir('editar tarifa', () => req.query(`
      UPDATE matarifa SET ${sets.join(', ')}, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
      WHERE cramo = @cramo AND ccober = @ccob AND ctarifa = @ctar`));
    if (!r.rowsAffected[0]) throw new NotFoundException(`No existe la tarifa ${ctarifa} de la cobertura ${ccober} del ramo ${cramo}.`);
    return { cramo, ccober: ccober.trim(), ctarifa: ctarifa.trim() };
  }

  // ── Tablas de tasas por edad ───────────────────────────────────────────────

  /** Tablas de tasas por edad (solo lectura): TOP 50 por código o descripción, con tramos y rango de edades. */
  async buscarTablasEdad(q: string) {
    const texto = (q ?? '').trim().slice(0, 60);
    const req = this.db.request();
    req.input('q', sql.VarChar(60), texto);
    req.input('q2', sql.VarChar(62), `%${texto}%`);
    const r = await req.query(`
      SELECT TOP (50) RTRIM(t.ctablaedad) AS ctablaedad, RTRIM(t.xtablaedad) AS xtablaedad,
        COUNT(d.ctablaedad) AS ntramos, MIN(d.nedad_min) AS nedad_min, MAX(d.nedad_max) AS nedad_max
      FROM mapltabedad t WITH (NOLOCK)
      LEFT JOIN mapltabedad_d d WITH (NOLOCK) ON d.ctablaedad = t.ctablaedad
      WHERE (@q = '' OR t.ctablaedad LIKE @q2 OR t.xtablaedad LIKE @q2)
      GROUP BY t.ctablaedad, t.xtablaedad
      ORDER BY t.ctablaedad`);
    return r.recordset ?? [];
  }

  /** Parentescos (maparent) — solo lectura; cparentesco es el cparen de los planes de personas. */
  async listarParentescos() {
    const r = await this.db.request().query(`
      SELECT cparentesco AS cparen, LTRIM(RTRIM(xparentesco)) AS xparentesco
      FROM maparent WITH (NOLOCK) ORDER BY cparentesco`);
    return r.recordset ?? [];
  }

  async obtenerTablaEdad(ctablaedad: string) {
    const req = this.db.request();
    req.input('ctab', sql.Char(10), ctablaedad.trim());
    const r = await req.query(`
      SELECT RTRIM(ctablaedad) AS ctablaedad, RTRIM(xtablaedad) AS xtablaedad, RTRIM(iaplica_tabedad) AS iaplica_tabedad
      FROM mapltabedad WITH (NOLOCK) WHERE ctablaedad = @ctab;
      SELECT nedad_min, nedad_max, pprima, mprima, msuma, msumamax
      FROM mapltabedad_d WITH (NOLOCK) WHERE ctablaedad = @ctab ORDER BY nedad_min;
      SELECT DISTINCT cramo, RTRIM(cplan) AS cplan, RTRIM(ccobertura) AS ccobertura
      FROM mapltarifas_per WITH (NOLOCK) WHERE ctablatar = @ctab ORDER BY cramo, cplan;`);
    const [cabecera, tramos, planes] = r.recordsets as unknown as Record<string, unknown>[][];
    if (!cabecera.length) throw new NotFoundException(`No existe la tabla de tasas ${ctablaedad}.`);
    return { ...cabecera[0], tramos, usada_por: planes };
  }

  async crearTablaEdad(dto: CrearTablaEdadDto) {
    this.exigirReglas(validarTramos(dto.tramos));
    if (await this.existe('SELECT 1 FROM mapltabedad WHERE ctablaedad = @ctab', { ctab: dto.ctablaedad })) {
      throw new ConflictException(`La tabla de tasas ${dto.ctablaedad} ya existe.`);
    }
    const req = this.db.request();
    req.input('ctab', sql.Char(10), dto.ctablaedad.trim());
    req.input('xtab', sql.Char(60), dto.xtablaedad.trim());
    req.input('iaplica', sql.Char(2), dto.iaplica_tabedad ?? 'TS');
    this.auditoria(req);
    const sentencias = [`
      INSERT INTO mapltabedad (ctablaedad, u_version, xtablaedad, iaplica_tabedad, cprog, ifuente, fingreso, cusuario, ccategoria)
      VALUES (@ctab, '!', @xtab, @iaplica, @cprog, @ifuente, GETDATE(), @cusuario, 1);`];
    dto.tramos.forEach((t, i) => sentencias.push(this.sqlTramo(req, t, i)));
    await this.escribir('crear tabla de tasas', () => req.query(lote(sentencias)));
    return { ctablaedad: dto.ctablaedad.trim(), tramos: dto.tramos.length };
  }

  /** Reemplaza todos los tramos de una tabla existente (corrige tasas). Afecta a los planes que la usan. */
  async reemplazarTramos(ctablaedad: string, tramos: TramoEdadDto[]) {
    this.exigirReglas(validarTramos(tramos));
    const tabla = await this.obtenerTablaEdad(ctablaedad);
    const req = this.db.request();
    req.input('ctab', sql.Char(10), ctablaedad.trim());
    this.auditoria(req);
    const sentencias = ['DELETE FROM mapltabedad_d WHERE ctablaedad = @ctab;'];
    tramos.forEach((t, i) => sentencias.push(this.sqlTramo(req, t, i)));
    await this.escribir('reemplazar tramos', () => req.query(lote(sentencias)));
    this.logger.warn(`reemplazarTramos ${ctablaedad}: ${tabla.tramos.length} → ${tramos.length} tramos; planes: ${JSON.stringify(tabla.usada_por)}`);
    return { ctablaedad: ctablaedad.trim(), antes: tabla.tramos, tramos: tramos.length, usada_por: tabla.usada_por };
  }

  // ── Planes (spMantPlanes) ──────────────────────────────────────────────────

  /**
   * Plan completo tal como está en Sis2000 (solo lectura), para que el configurador lo respalde antes de modificarlo
   * y pueda restaurarlo. Trae las filas de las tablas que llena spMantPlanes y el plan en la forma de PlanDto.
   * null si el plan no existe (así el configurador distingue «no existe» de «no se pudo leer»).
   */
  async obtenerPlan(cramo: number, cplan: string): Promise<PlanLeido | null> {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const donde = 'WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan';
    // Cabecera: la versión vigente primero (V y fdesde_plan más reciente). maplantar_ano y maarancel del plan, y
    // macattip del ramo (afecta a todos sus planes), para que el builder respalde y restaure también esos temas.
    const r = await req.query(`
      SELECT TOP 1 * FROM maplanes ${donde} ORDER BY CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, fdesde_plan DESC;
      SELECT TOP 1 * FROM maplanes_per ${donde} ORDER BY CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, fdesde_plan DESC;
      SELECT * FROM maplantar ${donde};
      SELECT * FROM maplcober_per ${donde};
      SELECT * FROM mapltarifas_per ${donde};
      SELECT * FROM mapledades_per ${donde};
      SELECT * FROM maplanes_frec ${donde};
      SELECT cramo, RTRIM(cplan) AS cplan, RTRIM(centidad) AS centidad, RTRIM(citem) AS citem, RTRIM(itipouso) AS itipouso
      FROM mausuplan ${donde};
      SELECT * FROM maplprov_per ${donde};
      SELECT * FROM maplantar_ano ${donde} ORDER BY ccober, ctarifa, nantiguedad_desde;
      SELECT * FROM maarancel ${donde} ORDER BY ctipoprod, cproductor, ccober, ctarifa, fdesde;
      SELECT * FROM macattip WITH (NOLOCK) WHERE cramo = @cramo ORDER BY ctipo, ccategotr;`);
    const [
      maplanes, maplanes_per, maplantar, maplcober_per, mapltarifas_per, mapledades_per, maplanes_frec, mausuplan, maplprov_per,
      maplantar_ano, maarancel, macattip,
    ] = r.recordsets as unknown as Record<string, unknown>[][];
    const filas: FilasPlan = {
      maplanes, maplanes_per, maplantar, maplcober_per, mapltarifas_per, mapledades_per, maplanes_frec, mausuplan, maplprov_per,
      maplantar_ano, maarancel, macattip,
    };
    return reconstruirPlan(filas);
  }

  async crearPlan(dto: PlanDto) {
    await this.validarPlanEnBd(dto);
    if (await this.planExiste(dto.cramo, dto.cplan)) throw new ConflictException(`El plan ${dto.cplan} ya existe en el ramo ${dto.cramo}.`);
    await this.mantPlan('C', dto);
    if (!(await this.planExiste(dto.cramo, dto.cplan))) {
      throw new BadRequestException('spMantPlanes terminó sin crear el plan. Revisa los datos enviados.');
    }
    await this.grabarTasasPlan(dto);
    return { cramo: dto.cramo, cplan: dto.cplan.trim() };
  }

  async editarPlan(cramo: number, cplan: string, dto: PlanDto) {
    if (dto.cramo !== cramo || dto.cplan.trim() !== cplan.trim()) throw new BadRequestException('cramo y cplan del cuerpo deben coincidir con la ruta.');
    await this.validarPlanEnBd(dto);
    if (!(await this.planExiste(cramo, cplan))) throw new NotFoundException(`No existe el plan ${cplan} en el ramo ${cramo}.`);
    await this.mantPlan('U', dto);
    await this.grabarTasasPlan(dto);
    return { cramo, cplan: cplan.trim() };
  }

  async eliminarPlan(cramo: number, cplan: string) {
    if (!(await this.planExiste(cramo, cplan))) throw new NotFoundException(`No existe el plan ${cplan} en el ramo ${cramo}.`);
    // spMantPlanes borra datos en Sis2000 (incidente en mantenimiento de planes): desde aquí nunca se borra.
    throw new ForbiddenException('Borrar planes en Sis2000 no está permitido desde el configurador.');
  }

  /** Ya no se usa: se conserva para referencia. */
  private async eliminarPlanAnterior(cramo: number, cplan: string) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`
      SELECT TOP 1 RTRIM(p.xplan) AS xplan, RTRIM(p.cproducto) AS cproducto, RTRIM(p.cmoneda) AS cmoneda, p.itiporen,
             CONVERT(varchar(10), p.fdesde, 23) AS fdesde, CONVERT(varchar(10), p.fhasta, 23) AS fhasta,
             CASE WHEN EXISTS (SELECT 1 FROM maplantar t WHERE t.cramo = p.cramo AND t.cplan = p.cplan) THEN 'cosas' ELSE 'personas' END AS type
      FROM maplanes p WITH (NOLOCK) WHERE p.cramo = @cramo AND p.cplan = @cplan`);
    const p = r.recordset?.[0];
    if (!p) throw new NotFoundException(`No existe el plan ${cplan} en el ramo ${cramo}.`);
    await this.mantPlan('D', {
      type: p.type, cramo, cplan, xplan: p.xplan, cproducto: p.cproducto, cmoneda: p.cmoneda, itiporen: p.itiporen,
      fdesde: p.fdesde, fhasta: p.fhasta ?? '2099-12-31', all_productor: true, coberturas: [], frecuencias: [],
    } as unknown as PlanDto);
    return { cramo, cplan: cplan.trim(), eliminado: !(await this.planExiste(cramo, cplan)) };
  }

  // ── Canales alternos del plan (mausuplan centidad C) ───────────────────────

  /**
   * Agrega canales alternos al plan en mausuplan (centidad 'C', itipouso 'A', citem = ccanalalt; citem NULL = todos).
   * Solo alta: si la fila ya está no se toca, y nunca se borra (ni inclusiones ni exclusiones 'E'). No pasa por
   * spMantPlanes. El id se calcula como en spConfigurePlansProduct (MAX + 1) con bloqueo dentro de la transacción.
   */
  async agregarCanalesPlan(cramo: number, cplan: string, dto: CanalesPlanDto) {
    const todos = dto.all_canal === true;
    const canales = todos ? [] : [...new Set(dto.canales ?? [])];
    if (!todos && !canales.length) throw new BadRequestException('Indica al menos un canal o «todos».');
    await this.exigirPlanCualquiera(cramo, cplan);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.VarChar(10), cplan.trim());
    if (canales.length) {
      const lista = canales.map((c, i) => { req.input(`c${i}`, sql.Int, c); return `@c${i}`; }).join(', ');
      const r = await req.query(`SELECT ccanalalt FROM macanalalt WITH (NOLOCK) WHERE bactivo = 1 AND ccanalalt IN (${lista})`);
      const activos = new Set((r.recordset ?? []).map((f: Record<string, unknown>) => Number(f.ccanalalt)));
      const faltan = canales.filter((c) => !activos.has(c));
      if (faltan.length) throw new BadRequestException(`Canal(es) que no existen o no están activos en macanalalt: ${faltan.join(', ')}.`);
    }
    const items = todos ? [null] : canales.map((c) => String(c));
    items.forEach((v, i) => req.input(`it${i}`, sql.VarChar(10), v));
    const r = await this.escribir('agregar canales al plan', () => req.query(lote([
      'DECLARE @id INT = (SELECT ISNULL(MAX(id), 0) FROM mausuplan WITH (UPDLOCK, HOLDLOCK));',
      'DECLARE @nuevos TABLE (citem VARCHAR(10) NULL);',
      ...sentenciasCanalesPlan(items.length),
    ]) + '\nSELECT citem FROM @nuevos;'));
    const nuevos = ((r.recordset ?? []) as Record<string, unknown>[]).map((f) => (f.citem == null ? null : rtrim(f.citem)));
    const avisos: string[] = [];
    const exc = this.db.request();
    exc.input('cramo', sql.SmallInt, cramo);
    exc.input('cplan', sql.VarChar(10), cplan.trim());
    const e = await exc.query(`SELECT RTRIM(citem) AS citem FROM mausuplan WITH (NOLOCK)
      WHERE cramo = @cramo AND cplan = @cplan AND centidad = 'C' AND itipouso = 'E'`);
    const excluidos = ((e.recordset ?? []) as Record<string, unknown>[]).map((f) => rtrim(f.citem));
    if (excluidos.length) avisos.push(`El plan tiene canales excluidos (itipouso E) que no se tocan: ${excluidos.join(', ')}.`);
    return {
      cramo,
      cplan: cplan.trim(),
      agregados: nuevos,
      ya_estaban: items.filter((v) => !nuevos.includes(v)),
      avisos,
    };
  }

  // ── Proveedores del plan (maplprov_per) ────────────────────────────────────
  // La relación es por plan (cramo, cplan): aplica a todas sus coberturas. Al emitir personas,
  // sp_registrar_proveedor_poliza_nexus copia a adproveedor los proveedores vigentes del plan.

  /**
   * Catálogo de proveedores (maclient_prov ⋈ maclient) por nombre, RIF o cci_rif, agrupado con sus claves.
   * De maclient_prov solo salen columnas de una lista blanca que existan (nunca datos bancarios u otros sensibles).
   */
  async listarProveedores(q: string) {
    const texto = (q ?? '').trim().slice(0, 60);
    const existentes = await this.columnasDe('maclient_prov');
    const extra = COLUMNAS_CATALOGO_PROVEEDOR.filter((c) => existentes.has(c)).map((c) => `p.${c}`);
    const req = this.db.request();
    req.input('q', sql.VarChar(60), texto);
    req.input('q2', sql.VarChar(62), `%${texto}%`);
    const r = await req.query(`
      SELECT TOP (60) ${['p.cci_rif', ...extra].join(', ')}, RTRIM(c.cid) AS cid, LTRIM(RTRIM(c.xcliente)) AS xcliente
      FROM maclient_prov p WITH (NOLOCK)
      INNER JOIN maclient c WITH (NOLOCK) ON c.cci_rif = p.cci_rif
      WHERE (@q = '' OR c.xcliente LIKE @q2 OR RTRIM(c.cid) LIKE @q2 OR CONVERT(VARCHAR(20), p.cci_rif) LIKE @q2)
      ORDER BY c.xcliente`);
    const grupos = new Map<string, { cci_rif: number; cid: string; xcliente: string; claves: Record<string, unknown>[] }>();
    for (const fila of (r.recordset ?? []) as Record<string, unknown>[]) {
      const { cid, xcliente, cci_rif, ...resto } = fila;
      const k = String(cci_rif);
      if (!grupos.has(k)) grupos.set(k, { cci_rif: Number(cci_rif), cid: rtrim(cid), xcliente: rtrim(xcliente), claves: [] });
      grupos.get(k)!.claves.push(resto);
    }
    return [...grupos.values()];
  }

  /** Proveedores del plan (todas las vigencias, también las de baja) y si la escritura está habilitada. */
  async listarProveedoresPlan(cramo: number, cplan: string) {
    const columnas = await this.columnasDe('maplprov_per');
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`
      SELECT m.cramo, RTRIM(m.cplan) AS cplan, m.cci_rif, m.cclave_num,
             CONVERT(varchar(10), m.fdesde, 23) AS fdesde, CONVERT(varchar(10), m.fhasta, 23) AS fhasta,
             m.itiposerv, m.mcosto, m.mcostoext, RTRIM(m.cmoneda) AS cmoneda,
             RTRIM(c.cid) AS cid, LTRIM(RTRIM(c.xcliente)) AS xcliente,
             CASE WHEN m.fdesde <= CAST(GETDATE() AS date) AND (m.fhasta IS NULL OR m.fhasta >= CAST(GETDATE() AS date))
                  THEN 1 ELSE 0 END AS vigente
      FROM maplprov_per m WITH (NOLOCK)
      LEFT JOIN maclient c WITH (NOLOCK) ON c.cci_rif = m.cci_rif
      WHERE m.cramo = @cramo AND m.cplan = @cplan
      ORDER BY c.xcliente, m.cclave_num, m.fdesde`);
    return {
      escritura_habilitada: proveedoresEscrituraHabilitada(),
      /** Columna de cobertura en maplprov_per (null = la relación es solo por plan). */
      columna_cobertura: ['ccobertura', 'ccober'].find((c) => columnas.has(c)) ?? null,
      proveedores: (r.recordset ?? []).map((f: Record<string, unknown>) => ({ ...f, vigente: f.vigente === 1 })),
    };
  }

  async agregarProveedorPlan(cramo: number, cplan: string, dto: ProveedorPlanDto) {
    const columnas = await this.exigirEscrituraProveedores();
    await this.exigirPlanCualquiera(cramo, cplan);
    await this.exigirProveedor(dto.cci_rif, dto.cclave_num);
    const actuales = (await this.listarProveedoresPlan(cramo, cplan)).proveedores as unknown as ProveedorPlanDto[];
    this.exigirReglas(validarProveedorPlan(dto, actuales));
    const req = this.db.request();
    this.claveProveedor(req, cramo, cplan, dto);
    req.input('fhasta', sql.Date, dto.fhasta ?? null);
    req.input('itiposerv', sql.Int, dto.itiposerv ?? 1);
    req.input('mcosto', sql.Numeric(17, 2), dto.mcosto ?? 0);
    req.input('mcostoext', sql.Numeric(17, 2), dto.mcostoext ?? 0);
    req.input('cmoneda', sql.Char(4), (dto.cmoneda ?? '$').trim() || '$');
    this.auditoria(req);
    // Nombres de columna de listas fijas (nunca texto del usuario); valores siempre parametrizados.
    const auditoria = AUDITORIA_ALTA.filter(([c]) => columnas.has(c));
    const cols = [...COLUMNAS_PROVEEDOR_PLAN, ...auditoria.map(([c]) => c)];
    const vals = [...COLUMNAS_PROVEEDOR_PLAN.map((c) => `@${c}`), ...auditoria.map(([, v]) => v)];
    await this.escribir('agregar proveedor al plan', () =>
      req.query(`INSERT INTO maplprov_per (${cols.join(', ')}) VALUES (${vals.join(', ')})`));
    return { cramo, cplan: cplan.trim(), cci_rif: dto.cci_rif, cclave_num: dto.cclave_num, fdesde: dto.fdesde };
  }

  async editarProveedorPlan(cramo: number, cplan: string, dto: EditarProveedorPlanDto) {
    const columnas = await this.exigirEscrituraProveedores();
    const sets: string[] = [];
    const req = this.db.request();
    if (dto.sin_fin === true) {
      if (dto.fhasta !== undefined) throw new BadRequestException('Indica fecha hasta o sin fin, no ambas.');
      sets.push('fhasta = NULL');
    } else if (dto.fhasta !== undefined) {
      if (dto.fhasta < dto.fdesde) throw new BadRequestException('La vigencia hasta es anterior a la vigencia desde.');
      sets.push('fhasta = @fhasta'); req.input('fhasta', sql.Date, dto.fhasta);
    }
    if (dto.itiposerv !== undefined) { sets.push('itiposerv = @itiposerv'); req.input('itiposerv', sql.Int, dto.itiposerv); }
    if (dto.mcosto !== undefined) { sets.push('mcosto = @mcosto'); req.input('mcosto', sql.Numeric(17, 2), dto.mcosto); }
    if (dto.mcostoext !== undefined) { sets.push('mcostoext = @mcostoext'); req.input('mcostoext', sql.Numeric(17, 2), dto.mcostoext); }
    if (dto.cmoneda !== undefined) { sets.push('cmoneda = @cmoneda'); req.input('cmoneda', sql.Char(4), dto.cmoneda.trim() || '$'); }
    if (!sets.length) throw new BadRequestException('No hay campos para actualizar.');
    this.claveProveedor(req, cramo, cplan, dto);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    for (const [c, v] of AUDITORIA_MOD) if (columnas.has(c)) sets.push(`${c} = ${v}`);
    const r = await this.escribir('editar proveedor del plan', () => req.query(`
      UPDATE maplprov_per SET ${sets.join(', ')}
      WHERE cramo = @cramo AND cplan = @cplan AND cci_rif = @cci_rif AND cclave_num = @cclave_num AND fdesde = @fdesde`));
    if (!r.rowsAffected[0]) throw new NotFoundException(this.noExisteProveedor(cramo, cplan, dto));
    return { cramo, cplan: cplan.trim(), cci_rif: dto.cci_rif, cclave_num: dto.cclave_num, fdesde: dto.fdesde };
  }

  /** Baja = cerrar la vigencia (fhasta); nunca se borra la fila. */
  async bajaProveedorPlan(cramo: number, cplan: string, dto: BajaProveedorPlanDto) {
    const columnas = await this.exigirEscrituraProveedores();
    const fhasta = dto.fhasta_baja ?? new Date().toISOString().slice(0, 10);
    if (fhasta < dto.fdesde) throw new BadRequestException('La fecha de baja es anterior a la vigencia desde.');
    const req = this.db.request();
    this.claveProveedor(req, cramo, cplan, dto);
    req.input('fhasta', sql.Date, fhasta);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const sets = ['fhasta = @fhasta', ...AUDITORIA_MOD.filter(([c]) => columnas.has(c)).map(([c, v]) => `${c} = ${v}`)];
    const r = await this.escribir('dar de baja el proveedor del plan', () => req.query(`
      UPDATE maplprov_per SET ${sets.join(', ')}
      WHERE cramo = @cramo AND cplan = @cplan AND cci_rif = @cci_rif AND cclave_num = @cclave_num AND fdesde = @fdesde`));
    if (!r.rowsAffected[0]) throw new NotFoundException(this.noExisteProveedor(cramo, cplan, dto));
    return { cramo, cplan: cplan.trim(), cci_rif: dto.cci_rif, cclave_num: dto.cclave_num, fdesde: dto.fdesde, fhasta };
  }

  private noExisteProveedor(cramo: number, cplan: string, k: { cci_rif: number; cclave_num: number; fdesde: string }) {
    return `No existe el proveedor ${k.cci_rif} (clave ${k.cclave_num}, desde ${k.fdesde}) en el plan ${cplan.trim()} del ramo ${cramo}.`;
  }

  private claveProveedor(req: sql.Request, cramo: number, cplan: string, k: { cci_rif: number; cclave_num: number; fdesde: string }) {
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    req.input('cci_rif', sql.Numeric(18, 0), k.cci_rif);
    req.input('cclave_num', sql.Numeric(10, 0), k.cclave_num);
    req.input('fdesde', sql.Date, k.fdesde);
  }

  /** Bandera encendida, columnas mínimas presentes y sin columna de cobertura (si la hubiera, falta elegirla por cobertura). */
  private async exigirEscrituraProveedores() {
    if (!proveedoresEscrituraHabilitada()) {
      throw new BadRequestException(
        'La escritura de proveedores del plan está desactivada (CONFIGURADOR_PROVEEDORES_ESCRITURA) hasta confirmar la estructura de maplprov_per en Sis2000_QA.',
      );
    }
    const columnas = await this.columnasDe('maplprov_per');
    const faltan = COLUMNAS_PROVEEDOR_PLAN.filter((c) => !columnas.has(c));
    if (faltan.length) throw new BadRequestException(`maplprov_per no tiene las columnas esperadas: ${faltan.join(', ')}.`);
    const cob = ['ccobertura', 'ccober'].find((c) => columnas.has(c));
    if (cob) throw new BadRequestException(`maplprov_per tiene columna de cobertura (${cob}): hay que habilitar la elección por cobertura antes de escribir.`);
    return columnas;
  }

  private async exigirPlanCualquiera(cramo: number, cplan: string) {
    const existe = await this.existe(
      'SELECT 1 FROM maplanes WHERE cramo = @cramo AND cplan = @cplan UNION ALL SELECT 1 FROM maplanes_per WHERE cramo = @cramo AND cplan = @cplan',
      { cramo, cplan },
    );
    if (!existe) throw new BadRequestException(`No existe el plan ${cplan.trim()} en el ramo ${cramo}.`);
  }

  private async exigirProveedor(cciRif: number, cclave: number) {
    const conClave = (await this.columnasDe('maclient_prov')).has('cclave_num');
    const req = this.db.request();
    req.input('cci_rif', sql.Numeric(18, 0), cciRif);
    req.input('cclave_num', sql.Numeric(10, 0), cclave);
    const r = await req.query(`SELECT CASE WHEN EXISTS (SELECT 1 FROM maclient_prov WHERE cci_rif = @cci_rif${
      conClave ? ' AND cclave_num = @cclave_num' : ''}) THEN 1 ELSE 0 END AS e`);
    if (r.recordset?.[0]?.e !== 1) {
      throw new BadRequestException(`El proveedor ${cciRif}${conClave ? ` con clave ${cclave}` : ''} no está en maclient_prov.`);
    }
  }

  /** Nombres de columna (minúsculas) de una tabla de dbo; el nombre de tabla viene siempre del código. */
  private async columnasDe(tabla: 'maplprov_per' | 'maclient_prov'): Promise<Set<string>> {
    const req = this.db.request();
    req.input('tabla', sql.VarChar(128), `dbo.${tabla}`);
    const r = await req.query('SELECT LOWER(name) AS name FROM sys.columns WHERE object_id = OBJECT_ID(@tabla)');
    return new Set((r.recordset ?? []).map((f: Record<string, unknown>) => String(f.name)));
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async validarPlanEnBd(dto: PlanDto) {
    this.exigirReglas(validarPlan(dto));
    await this.exigirRamo(dto.cramo);
    if (!(await this.existe('SELECT 1 FROM maproductos WHERE cproducto = @cprod', { cprod: dto.cproducto }))) {
      throw new BadRequestException(`No existe el producto ${dto.cproducto}.`);
    }
    const errores: string[] = [];
    for (const c of dto.coberturas) {
      const claves = { cramo: dto.cramo, ccob: c.ccobertura, ctar: c.ctarifa };
      if (!(await this.existe(`SELECT 1 FROM matarifa WHERE cramo = @cramo AND ccober = @ccob AND ctarifa = @ctar AND iestado = 'V'`, claves))) {
        errores.push(`La cobertura ${c.ccobertura} no tiene la tarifa ${c.ctarifa} vigente en el ramo ${dto.cramo}.`);
      }
      for (const ctab of new Set((c.parentescos ?? []).map((p) => p.ctablatar.trim()))) {
        if (!(await this.existe('SELECT 1 FROM mapltabedad_d WHERE ctablaedad = @ctab', { ctab }))) {
          errores.push(`La tabla de tasas ${ctab} no existe o no tiene tramos.`);
        }
      }
    }
    this.exigirReglas(errores);
  }

  private async mantPlan(operation: 'C' | 'U' | 'D', dto: PlanDto) {
    if (operation === 'D') throw new ForbiddenException('Borrar planes en Sis2000 no está permitido desde el configurador.');
    const T = sql;
    const req = this.db.request();
    const allProductor = dto.all_productor === true;
    const allCanal = dto.all_canal === true;
    const codigo = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : v.trim());
    req.input('type', T.VarChar(10), dto.type);
    req.input('operation', T.Char(1), operation);
    req.input('cusuario', T.Int, CUSUARIO);
    req.input('cplan', T.VarChar(6), dto.cplan.trim());
    req.input('xplan', T.VarChar(60), dto.xplan.trim());
    req.input('fdesde', T.Date, dto.fdesde);
    req.input('fhasta', T.Date, dto.fhasta);
    req.input('cramo', T.Int, dto.cramo);
    req.input('cmoneda', T.VarChar(3), (dto.cmoneda ?? '$').trim());
    req.input('xobservacion', T.VarChar(255), dto.xobservacion ?? '');
    req.input('ctenedor', T.Int, dto.ctenedor ?? null);
    req.input('cbeneficiario', T.Int, dto.cbeneficiario ?? null);
    req.input('bnacional', T.Bit, dto.bnacional ?? null);
    req.input('cproducto', T.VarChar(6), dto.cproducto.trim());
    req.input('ctipo', T.Int, dto.ctipo ?? null);
    req.input('itiporen', T.Char(1), dto.itiporen ?? 'A');
    req.input('idevolucion', T.Char(1), dto.idevolucion ?? 'N');
    req.input('iestado', T.Char(1), 'V');
    req.input('all_canal', T.Bit, allCanal ? 1 : 0);
    req.input('all_productor', T.Bit, allProductor ? 1 : 0);
    req.input('canales', T.NVarChar(T.MAX), JSON.stringify(allCanal ? [] : (dto.canales ?? []).map((c) => ({ ccanalalt: c }))));
    req.input('productores', T.NVarChar(T.MAX), JSON.stringify(allProductor ? [] : (dto.productores ?? []).map((p) => ({ cproductor: p }))));
    req.input('coberturas', T.NVarChar(T.MAX), JSON.stringify(dto.coberturas.map((c) => ({
      ccobertura: codigo(c.ccobertura),
      ctarifa: codigo(c.ctarifa),
      ...(dto.type === 'cosas'
        ? { msumamin: c.msumamin ?? 0, msumamax: c.msumamax ?? 0, mprima: c.mprima ?? 0 }
        : {
            bobligatoria: c.bobligatoria ?? true,
            parentescos: (c.parentescos ?? []).map((p) => ({
              cparen: p.cparen, csexo: p.csexo, ctablatar: p.ctablatar.trim(), nedad_min: p.nedad_min, nedad_max: p.nedad_max,
              msuma: p.msuma ?? 0, msumamax: p.msumamax ?? 0, mprima: p.mprima ?? 0,
            })),
          }),
    }))));
    req.input('frecuencias', T.NVarChar(T.MAX), JSON.stringify(dto.frecuencias.map((f) => ({
      ifrecuencia: f.ifrecuencia.trim(), xfrecuencia: f.xfrecuencia.trim(), ndias: f.ndias ?? null,
    }))));
    const r = await this.escribir(`spMantPlanes ${operation}`, async () => {
      try {
        return await req.execute('spMantPlanes');
      } catch (err) {
        // spMantPlanes inserta mapledades_per una vez por cobertura y parentesco: con varias coberturas, desde la
        // segunda choca con la PK (cramo, cplan, fdesde, cparen). El resto del plan se graba igual (sin XACT_ABORT).
        if (dto.type === 'personas' && operation === 'C' && soloEdadesRepetidas(err) && (await this.planPersonasExiste(dto.cramo, dto.cplan))) {
          this.logger.warn(`spMantPlanes C ${dto.cramo}/${dto.cplan}: edades repetidas por cobertura (mapledades_per_pk); el plan quedó creado.`);
          return { recordset: [{}] } as unknown as Awaited<ReturnType<typeof req.execute>>;
        }
        throw err;
      }
    });
    const fila = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    const fallo = fila.berror === true || fila.error === true || fila.status === false || fila.success === false;
    if (fallo) {
      this.logger.error(`spMantPlanes ${operation} ${dto.cramo}/${dto.cplan}: ${JSON.stringify(fila)}`);
      throw new BadRequestException(rtrim(fila.mensaje ?? fila.message ?? fila.xmensaje) || 'spMantPlanes rechazó el plan.');
    }
    return fila;
  }

  /**
   * spMantPlanes no recibe tasa por cobertura: en cosas se graba maplantar.pprima después, solo en la versión vigente
   * del plan (MAX fdesde_plan 'V' de maplanes), sin tocar versiones anteriores.
   */
  private async grabarTasasPlan(dto: PlanDto) {
    if (dto.type !== 'cosas') return;
    for (const c of dto.coberturas.filter((x) => x.pprima !== undefined)) {
      const req = this.db.request();
      req.input('cramo', sql.SmallInt, dto.cramo);
      req.input('cplan', sql.Char(6), dto.cplan.trim());
      req.input('ccob', sql.Char(4), c.ccobertura.trim());
      req.input('pprima', sql.Numeric(13, 6), c.pprima);
      req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
      await this.escribir('grabar tasa del plan', () => req.query(`
        UPDATE maplantar SET pprima = @pprima, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
        WHERE cramo = @cramo AND cplan = @cplan AND ccober = @ccob AND fdesde_plan = ${SQL_VERSION_VIGENTE('maplanes')}`));
    }
  }

  /** El plan existe en maplanes (cosas/auto) o en maplanes_per (personas). */
  private planExiste(cramo: number, cplan: string) {
    return this.existe(
      'SELECT 1 FROM maplanes WHERE cramo = @cramo AND cplan = @cplan UNION ALL SELECT 1 FROM maplanes_per WHERE cramo = @cramo AND cplan = @cplan',
      { cramo, cplan },
    );
  }

  private async exigirRamo(cramo: number) {
    if (!(await this.existe('SELECT 1 FROM maramos WHERE cramo = @cramo', { cramo }))) throw new BadRequestException(`No existe el ramo ${cramo}.`);
  }

  private async exigirCobertura(cramo: number, ccob: string) {
    if (!(await this.existe('SELECT 1 FROM macoberturas WHERE cramo = @cramo AND ccobertura = @ccob', { cramo, ccob }))) {
      throw new BadRequestException(`No existe la cobertura ${ccob} en el ramo ${cramo}.`);
    }
  }

  private exigirReglas(errores: string[]) {
    if (errores.length) throw new BadRequestException(errores.join(' '));
  }

  /** SELECT 1 … con parámetros por nombre: números → SmallInt, textos → VarChar recortado. */
  private async existe(query: string, params: Record<string, string | number>) {
    const req = this.db.request();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'number') req.input(k, sql.SmallInt, v);
      else req.input(k, sql.VarChar(20), v.trim());
    }
    const r = await req.query(`SELECT CASE WHEN EXISTS (${query}) THEN 1 ELSE 0 END AS e`);
    return r.recordset?.[0]?.e === 1;
  }

  private claveTarifa(req: sql.Request, k: { cramo: number; ccober: string; ctarifa: string }) {
    req.input('cramo', sql.SmallInt, k.cramo);
    req.input('ccob', sql.Char(4), k.ccober.trim());
    req.input('ctar', sql.Char(4), k.ctarifa.trim());
  }

  private auditoria(req: sql.Request) {
    req.input('cprog', sql.Char(20), CPROG);
    req.input('ifuente', sql.Char(10), IFUENTE);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
  }

  /** INSERT de matarifa_d con parámetros sufijados `i`; la clave (@cramo, @ccob, @ctar) y la auditoría ya están en req. */
  private sqlDetalle(req: sql.Request, d: DetalleTarifaDto, i: number) {
    req.input(`fdesde${i}`, sql.Date, d.fdesde);
    req.input(`fhasta${i}`, sql.Date, d.fhasta ?? null);
    req.input(`msumamin${i}`, sql.Numeric(17, 2), d.msumamin ?? 0);
    req.input(`msumamax${i}`, sql.Numeric(17, 2), d.msumamax ?? 0);
    req.input(`mprima${i}`, sql.Numeric(17, 2), d.mprima ?? 0);
    req.input(`pprima${i}`, sql.Numeric(13, 6), d.pprima ?? 0);
    req.input(`bfraded${i}`, sql.Char(1), bfradedBd(d.bfraded));
    req.input(`mdedu${i}`, sql.Numeric(17, 2), d.mdedu_fran ?? 0);
    req.input(`mdeduext${i}`, sql.Numeric(17, 2), d.mdedu_franext ?? 0);
    req.input(`pdedu${i}`, sql.Numeric(13, 6), d.pdedu_fran ?? 0);
    return `
      INSERT INTO matarifa_d (cramo, ccober, ctarifa, fdesde, u_version, fhasta, msumamin, msumamax, mprima, pprima, bfraded,
        mdedu_fran, mdedu_franext, pdedu_fran, iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
      VALUES (@cramo, @ccob, @ctar, @fdesde${i}, '!', @fhasta${i}, @msumamin${i}, @msumamax${i}, @mprima${i}, @pprima${i}, @bfraded${i},
        @mdedu${i}, @mdeduext${i}, @pdedu${i}, 'V', @cprog, @ifuente, GETDATE(), @cusuario, 1);`;
  }

  /** INSERT de mapltabedad_d con parámetros sufijados `i`; @ctab y la auditoría ya están en req. */
  private sqlTramo(req: sql.Request, t: TramoEdadDto, i: number) {
    req.input(`emin${i}`, sql.TinyInt, t.nedad_min);
    req.input(`emax${i}`, sql.TinyInt, t.nedad_max);
    req.input(`pprima${i}`, sql.Numeric(13, 6), t.pprima);
    req.input(`mprima${i}`, sql.Numeric(17, 6), t.mprima ?? 0);
    req.input(`msuma${i}`, sql.Numeric(17, 2), t.msuma ?? 0);
    req.input(`msumamax${i}`, sql.Numeric(17, 2), t.msumamax ?? 0);
    return `
      INSERT INTO mapltabedad_d (ctablaedad, nedad_min, u_version, nedad_max, msuma, msumamax, pprima, mprima, cprog, ifuente,
        fingreso, cusuario, ccategoria)
      VALUES (@ctab, @emin${i}, '!', @emax${i}, @msuma${i}, @msumamax${i}, @pprima${i}, @mprima${i}, @cprog, @ifuente, GETDATE(),
        @cusuario, 1);`;
  }

  private async escribir<R>(accion: string, fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (err) {
      throw this.errorSql(accion, err);
    }
  }

  /** Plan de personas ya grabado en maplanes_per (para tolerar las edades repetidas de spMantPlanes). */
  private async planPersonasExiste(cramo: number, cplan: string): Promise<boolean> {
    const req = this.db.request();
    req.input('cramo', sql.Int, cramo);
    req.input('cplan', sql.VarChar(6), cplan.trim());
    const r = await req.query('SELECT COUNT(*) AS n FROM maplanes_per WHERE cramo = @cramo AND RTRIM(cplan) = @cplan');
    return Number(r.recordset?.[0]?.n ?? 0) > 0;
  }

  /** 409/404 de los THROW propios (51000/51404); el resto → 400 con el detalle del driver. */
  private errorSql(accion: string, err: unknown) {
    return errorSql(this.logger, accion, err);
  }
}

/** true si todos los errores del driver son la PK de mapledades_per (edades repetidas por cobertura en spMantPlanes). */
function soloEdadesRepetidas(err: unknown): boolean {
  const e = (err ?? {}) as { message?: string; precedingErrors?: { message?: string }[] };
  const msgs = [e.message ?? '', ...(e.precedingErrors ?? []).map((p) => p?.message ?? '')]
    .map((m) => m.trim())
    .filter(Boolean);
  return msgs.length > 0 && msgs.every((m) => /mapledades_per_pk/i.test(m));
}
