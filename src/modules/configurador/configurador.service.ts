import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { parseSPError } from '../../common/helpers/sp-error.helper';
import { validarPlan, validarTramos } from './configurador.reglas';
import {
  CrearCoberturaDto, CrearDetalleTarifaDto, CrearTablaEdadDto, CrearTarifaDto, DetalleTarifaDto, EditarCoberturaDto,
  EditarTarifaDto, PlanDto, TramoEdadDto,
} from './dto/configurador.dto';

/** Usuario Sis2000 de la integración Exelixi (mismo de las emisiones Nexus). */
const CUSUARIO = 20364172;
/** Marca de auditoría en las filas que crea el configurador. */
const CPROG = 'NEXUS-CONFIG';
const IFUENTE = 'NEXUS';

const rtrim = (v: unknown) => String(v ?? '').trim();

/** Un solo lote en transacción: con XACT_ABORT cualquier error revierte todo (no depende de sql.Transaction del pool). */
const lote = (sentencias: string[]) => `SET XACT_ABORT ON;\nBEGIN TRAN;\n${sentencias.join('\n')}\nCOMMIT TRAN;`;

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

  // ── Coberturas ─────────────────────────────────────────────────────────────

  async listarCoberturas(cramo: number) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query(`
      SELECT cramo, RTRIM(ccobertura) AS ccobertura, RTRIM(xdescripcion_l) AS xdescripcion_l,
             RTRIM(xdescripcion_c) AS xdescripcion_c, RTRIM(xabreviatura) AS xabreviatura, bobligatoria,
             RTRIM(cmoneda) AS cmoneda, isuma, iestado, cramoint, ccoberturaint
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

  async crearDetalleTarifa(dto: CrearDetalleTarifaDto) {
    const claves = { cramo: dto.cramo, ccob: dto.ccober, ctar: dto.ctarifa };
    if (!(await this.existe('SELECT 1 FROM matarifa WHERE cramo = @cramo AND ccober = @ccob AND ctarifa = @ctar', claves))) {
      throw new NotFoundException(`No existe la tarifa ${dto.ctarifa} de la cobertura ${dto.ccober} del ramo ${dto.cramo}.`);
    }
    const req = this.db.request();
    this.claveTarifa(req, dto);
    this.auditoria(req);
    const insert = this.sqlDetalle(req, dto, 0);
    await this.escribir('crear detalle de tarifa', () => req.query(insert));
    return { cramo: dto.cramo, ccober: dto.ccober.trim(), ctarifa: dto.ctarifa.trim(), fdesde: dto.fdesde };
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

  // ── Internos ───────────────────────────────────────────────────────────────

  private async validarPlanEnBd(dto: PlanDto) {
    this.exigirReglas(validarPlan(dto));
    await this.exigirRamo(dto.cramo);
    if (!(await this.existe('SELECT 1 FROM maproducto WHERE cproducto = @cprod', { cprod: dto.cproducto }))) {
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
    const r = await this.escribir(`spMantPlanes ${operation}`, () => req.execute('spMantPlanes'));
    const fila = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    const fallo = fila.berror === true || fila.error === true || fila.status === false || fila.success === false;
    if (fallo) {
      this.logger.error(`spMantPlanes ${operation} ${dto.cramo}/${dto.cplan}: ${JSON.stringify(fila)}`);
      throw new BadRequestException(rtrim(fila.mensaje ?? fila.message ?? fila.xmensaje) || 'spMantPlanes rechazó el plan.');
    }
    return fila;
  }

  /** spMantPlanes no recibe tasa por cobertura: en cosas se graba maplantar.pprima después. */
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
        WHERE cramo = @cramo AND cplan = @cplan AND ccober = @ccob`));
    }
  }

  private planExiste(cramo: number, cplan: string) {
    return this.existe('SELECT 1 FROM maplanes WHERE cramo = @cramo AND cplan = @cplan', { cramo, cplan });
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
    return `
      INSERT INTO matarifa_d (cramo, ccober, ctarifa, fdesde, u_version, fhasta, msumamin, msumamax, mprima, pprima, bfraded,
        mdedu_fran, mdedu_franext, pdedu_fran, iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
      VALUES (@cramo, @ccob, @ctar, @fdesde${i}, '!', @fhasta${i}, @msumamin${i}, @msumamax${i}, @mprima${i}, @pprima${i}, '0', 0, 0, 0,
        'V', @cprog, @ifuente, GETDATE(), @cusuario, 1);`;
  }

  /** INSERT de mapltabedad_d con parámetros sufijados `i`; @ctab y la auditoría ya están en req. */
  private sqlTramo(req: sql.Request, t: TramoEdadDto, i: number) {
    req.input(`emin${i}`, sql.TinyInt, t.nedad_min);
    req.input(`emax${i}`, sql.TinyInt, t.nedad_max);
    req.input(`pprima${i}`, sql.Numeric(13, 6), t.pprima);
    req.input(`mprima${i}`, sql.Numeric(17, 2), t.mprima ?? 0);
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

  private errorSql(accion: string, err: unknown) {
    if (err instanceof BadRequestException || err instanceof ConflictException || err instanceof NotFoundException) return err;
    const msg = parseSPError(err);
    this.logger.error(`${accion}: ${msg}`);
    return new BadRequestException(`No se pudo ${accion}: ${msg}`);
  }
}
