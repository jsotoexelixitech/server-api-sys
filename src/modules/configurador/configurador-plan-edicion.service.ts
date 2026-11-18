import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import {
  CUSUARIO, SQL_CONFLICTO, SQL_NO_EXISTE, auditoriaSql, escribirSql, exigirBandera, existeSql, lote, rtrim, throwSql,
} from './configurador.comun';
import { BANDERA_PLANES, cabeceraPlan, filaPlana, type CabeceraPlan, type TablaPlan } from './configurador-fase2.comun';
import {
  avisosCabecera, edicionTarifaPlan, sexoTarifa, tarifaObligatoria, validarCabeceraPlan, validarCoberturaCosas, validarCoberturaPersonas,
} from './configurador.plan-edicion';
import { ConfiguradorService } from './configurador.service';
import { CabeceraPlanDto, CoberturaPersonasDto, CoberturaPlanDto, TarifaPlanDto } from './dto/configurador-plan-edicion.dto';

/** THROW con número propio que errorSql deja en 400 (validación hecha dentro del lote). */
const SQL_INVALIDO = 51400;

/** Aviso: sp_calculo_auto_nexus no filtra iestado de maplancob ni de maplantar (definición de Sis2000_QA, 18-nov-2026). */
const AVISO_CALCULO_AUTO =
  'sp_calculo_auto_nexus no filtra iestado de maplancob ni de maplantar: en la cotización de auto la cobertura sigue saliendo hasta corregir el SP ' +
  '(la cotización de condominio sí filtra maplantar.iestado).';

/**
 * Plan sin pasar por el JSON de spMantPlanes: cabecera (maplanes o maplanes_per, versión vigente) y coberturas
 * (patrimonial/auto: maplancob + maplantar; personas: maplcober_per + mapltarifas_per). Bandera CONFIGURADOR_PLANES_ESCRITURA.
 */
@Injectable()
export class ConfiguradorPlanEdicionService {
  private readonly logger = new Logger(ConfiguradorPlanEdicionService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly configurador: ConfiguradorService,
  ) {}

  // ── Cabecera ───────────────────────────────────────────────────────────────

  /**
   * Edita xplan (y xplan_c), cmoneda, cproducto e iestado de la versión vigente (fdesde_plan máxima, sin importar el
   * estado, para poder reactivar). 409 si al poner 'V' quedaría otra versión 'V' del mismo plan.
   */
  async editarCabecera(cramo: number, cplan: string, dto: CabeceraPlanDto) {
    exigirBandera(BANDERA_PLANES, 'planes');
    const errores = validarCabeceraPlan(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const cab = await this.cabecera(cramo, cplan);
    const advertencias: string[] = cab.enAmbas ? [`El plan ${cplan.trim()} está en maplanes y en maplanes_per: se edita ${cab.tabla}.`] : [];
    if (dto.cmoneda !== undefined) {
      const r = this.db.request();
      r.input('cmoneda', sql.Char(4), dto.cmoneda.trim());
      if (!(await existeSql(r, 'SELECT 1 FROM mamonedas WITH (NOLOCK) WHERE cmoneda = @cmoneda'))) {
        throw new BadRequestException(`La moneda ${dto.cmoneda.trim()} no existe en mamonedas.`);
      }
    }
    if (dto.cproducto !== undefined) {
      const r = this.db.request();
      r.input('cproducto', sql.Char(40), dto.cproducto.trim());
      r.input('cramo', sql.Numeric(5, 0), cramo);
      const p = await r.query('SELECT TOP 1 cramo FROM maproductos WITH (NOLOCK) WHERE cproducto = @cproducto ORDER BY CASE WHEN cramo = @cramo THEN 0 ELSE 1 END');
      const fila = p.recordset?.[0] as Record<string, unknown> | undefined;
      if (!fila) throw new BadRequestException(`El producto ${dto.cproducto.trim()} no existe en maproductos.`);
      advertencias.push(...avisosCabecera(dto.cproducto, fila.cramo == null ? null : Number(fila.cramo), cramo));
    }

    const t = cab.tabla;
    const req = this.planReq(cramo, cplan);
    const sets: string[] = [];
    if (dto.xplan !== undefined) {
      sets.push('xplan = @xplan', 'xplan_c = LEFT(RTRIM(@xplan), 25)');
      req.input('xplan', sql.Char(60), dto.xplan.trim());
    }
    if (dto.cmoneda !== undefined) { sets.push('cmoneda = @cmoneda'); req.input('cmoneda', sql.Char(4), dto.cmoneda.trim()); }
    if (dto.cproducto !== undefined) { sets.push('cproducto = @cproducto'); req.input('cproducto', sql.Char(10), dto.cproducto.trim()); }
    if (dto.iestado !== undefined) { sets.push('iestado = @iestado'); req.input('iestado', sql.Char(1), dto.iestado); }
    req.input('iestadoNuevo', sql.Char(1), dto.iestado ?? null);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const r = await escribirSql(this.logger, 'editar la cabecera del plan', () => req.query(lote([
      'DECLARE @r TABLE (xplan_a VARCHAR(60), cmoneda_a VARCHAR(4), cproducto_a VARCHAR(10), iestado_a CHAR(1), xplan_d VARCHAR(60), cmoneda_d VARCHAR(4), cproducto_d VARCHAR(10), iestado_d CHAR(1));',
      `DECLARE @vig DATETIME = (SELECT MAX(fdesde_plan) FROM ${t} WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan);`,
      'IF @vig IS NULL',
      throwSql(SQL_NO_EXISTE, `No existe el plan ${cplan.trim()} en ${t} del ramo ${cramo}.`),
      `IF @iestadoNuevo = 'V' AND EXISTS (SELECT 1 FROM ${t} WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan <> @vig AND iestado = 'V')`,
      throwSql(SQL_CONFLICTO, "Otra versión del plan ya está 'V': quedarían dos versiones vigentes."),
      `UPDATE ${t} SET ${sets.join(', ')}, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
       OUTPUT RTRIM(deleted.xplan), RTRIM(deleted.cmoneda), RTRIM(deleted.cproducto), deleted.iestado,
              RTRIM(inserted.xplan), RTRIM(inserted.cmoneda), RTRIM(inserted.cproducto), inserted.iestado INTO @r
       WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig;`,
    ]) + '\nSELECT r.*, CONVERT(varchar(10), @vig, 23) AS fdesde_plan FROM @r r;'));
    const f = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    const lado = (s: 'a' | 'd') => ({
      xplan: rtrim(f[`xplan_${s}`]), cmoneda: rtrim(f[`cmoneda_${s}`]), cproducto: rtrim(f[`cproducto_${s}`]), iestado: rtrim(f[`iestado_${s}`]),
    });
    this.logger.log(`${t} cabecera ${cramo}/${cplan.trim()}: ${JSON.stringify(lado('a'))} → ${JSON.stringify(lado('d'))}`);
    return { cramo, cplan: cplan.trim(), tabla: t, fdesde_plan: rtrim(f.fdesde_plan), antes: lado('a'), despues: lado('d'), advertencias };
  }

  // ── Coberturas de patrimonial y auto (maplancob + maplantar) ─────────────────────

  /**
   * Agrega la cobertura con su tarifa a la versión vigente ('V'). 409 si ya está activa (iestado 'V' o NULL, como la
   * deja spMantPlanes). Si estaba dada de baja ('I') se reactiva esa fila (no se duplica la llave).
   */
  async agregarCobertura(cramo: number, cplan: string, dto: CoberturaPlanDto) {
    exigirBandera(BANDERA_PLANES, 'planes');
    const errores = validarCoberturaCosas(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const cab = await this.exigirTabla(cramo, cplan, 'maplanes');
    const ccob = dto.ccobertura.trim();
    const ctar = dto.ctarifa.trim();
    const tarifa = await this.tarifaRamo(cramo, ccob, ctar);
    const advertencias: string[] = [];
    if (dto.bobligatoria != null && dto.bobligatoria !== tarifaObligatoria(tarifa.bobligatoria)) {
      advertencias.push(
        `En patrimonial y auto la obligatoriedad es de la tarifa ${ctar} (matarifa.bobligatoria='${tarifa.bobligatoria}', por ramo): no se cambió. Usa PATCH tarifas.`,
      );
    }
    if (tarifa.detallesV !== 1) advertencias.push(`La tarifa ${ccob}/${ctar} tiene ${tarifa.detallesV} filas 'V' en matarifa_d (debe ser exactamente una).`);

    const req = this.planReq(cramo, cplan);
    req.input('ccob', sql.Char(4), ccob);
    req.input('ctar', sql.Char(4), ctar);
    req.input('msumamin', sql.Numeric(17, 2), dto.msumamin ?? 0);
    req.input('msumamax', sql.Numeric(17, 2), dto.msumamax ?? 0);
    req.input('mprima', sql.Numeric(17, 2), dto.mprima ?? 0);
    req.input('pprima', sql.Numeric(13, 6), dto.pprima ?? 0);
    auditoriaSql(req);
    const r = await escribirSql(this.logger, 'agregar la cobertura al plan', () => req.query(lote([
      `DECLARE @vig DATETIME = (SELECT MAX(fdesde_plan) FROM maplanes WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V');`,
      'IF @vig IS NULL',
      throwSql(SQL_NO_EXISTE, `El plan ${cplan.trim()} no tiene versión 'V' en maplanes.`),
      'DECLARE @fh DATETIME = (SELECT fhasta_plan FROM maplanes WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig);',
      `IF EXISTS (SELECT 1 FROM maplancob WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig
         AND ccobertura = @ccob AND ISNULL(iestado, 'V') <> 'I')`,
      throwSql(SQL_CONFLICTO, `La cobertura ${ccob} ya está activa en la versión vigente del plan.`),
      `IF EXISTS (SELECT 1 FROM maplantar WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig
         AND ccober = @ccob AND iestado = 'V')`,
      throwSql(SQL_CONFLICTO, `La cobertura ${ccob} tiene tarifas 'V' en maplantar aunque no está activa en maplancob: corrígelo antes.`),
      "DECLARE @accion VARCHAR(12) = 'creada';",
      `DECLARE @fcob DATETIME = (SELECT MAX(fdesde_cob) FROM maplancob WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig
         AND ccobertura = @ccob AND iestado = 'I');`,
      `IF @fcob IS NULL
       BEGIN
         SET @fcob = @vig;
         INSERT INTO maplancob (cramo, cplan, ccobertura, fdesde_plan, u_version, fdesde_cob, fhasta_cob, bfraded, mdedu_fran, nmax_deduci,
           mmax_desem, mmax_desemext, pcoa_emp, iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
         VALUES (@cramo, @cplan, @ccob, @vig, '!', @fcob, @fh, 'N', 0, 0, 0, 0, 0, 'V', @cprog, @ifuente, GETDATE(), @cusuario, 1);
       END
       ELSE
       BEGIN
         UPDATE maplancob SET iestado = 'V', fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
         WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccobertura = @ccob AND fdesde_cob = @fcob;
         SET @accion = 'reactivada';
       END`,
      `IF EXISTS (SELECT 1 FROM maplantar WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccober = @ccob
         AND fdesde_cob = @fcob AND ctarifa = @ctar AND fdesde_tar = @fcob)
         UPDATE maplantar SET iestado = 'V', msumamin = @msumamin, msumamax = @msumamax, mprima = @mprima, pprima = @pprima,
           fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
         WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccober = @ccob AND fdesde_cob = @fcob AND ctarifa = @ctar
           AND fdesde_tar = @fcob;
       ELSE
         INSERT INTO maplantar (cramo, cplan, fdesde_plan, ccober, fdesde_cob, ctarifa, fdesde_tar, u_version, fhasta_tar, msumamin, msumamax,
           mprima, pprima, iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
         VALUES (@cramo, @cplan, @vig, @ccob, @fcob, @ctar, @fcob, '!', @fh, @msumamin, @msumamax, @mprima, @pprima, 'V', @cprog, @ifuente,
           GETDATE(), @cusuario, 1);`,
    ]) + '\nSELECT @accion AS accion, CONVERT(varchar(10), @vig, 23) AS fdesde_plan, CONVERT(varchar(10), @fcob, 23) AS fdesde_cob;'));
    const f = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    this.logger.log(`maplancob/maplantar alta ${cramo}/${cplan.trim()} ${ccob}/${ctar}: ${rtrim(f.accion)}`);
    return {
      cramo, cplan: cplan.trim(), ccobertura: ccob, ctarifa: ctar, fdesde_plan: rtrim(f.fdesde_plan) || cab.fdesde_plan.slice(0, 10),
      fdesde_cob: rtrim(f.fdesde_cob), accion: rtrim(f.accion), advertencias,
    };
  }

  /** Suma, prima o tasa de la tarifa del plan (maplantar 'V' de la versión vigente). Prima y tasa excluyentes. */
  async editarTarifa(cramo: number, cplan: string, ccobertura: string, ctarifa: string, dto: TarifaPlanDto) {
    exigirBandera(BANDERA_PLANES, 'planes');
    const { errores, campos, ajustes } = edicionTarifaPlan(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await this.exigirTabla(cramo, cplan, 'maplanes');
    const ccob = ccobertura.trim();
    const ctar = ctarifa.trim();
    const req = this.planReq(cramo, cplan);
    req.input('ccob', sql.Char(4), ccob);
    req.input('ctar', sql.Char(4), ctar);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const sets = Object.entries(campos).map(([k, v]) => {
      req.input(k, k === 'pprima' ? sql.Numeric(13, 6) : sql.Numeric(17, 2), v);
      return `${k} = @${k}`;
    });
    const objetivo = `SELECT TOP (1) * FROM maplantar WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig
      AND ccober = @ccob AND ctarifa = @ctar AND iestado = 'V' ORDER BY fdesde_cob DESC, fdesde_tar DESC`;
    const r = await escribirSql(this.logger, 'editar la tarifa del plan', () => req.query(lote([
      `DECLARE @vig DATETIME = (SELECT MAX(fdesde_plan) FROM maplanes WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V');`,
      'DECLARE @r TABLE (msumamin_a NUMERIC(17,2), msumamax_a NUMERIC(17,2), mprima_a NUMERIC(17,2), pprima_a NUMERIC(13,6), msumamin NUMERIC(17,2), msumamax NUMERIC(17,2), mprima NUMERIC(17,2), pprima NUMERIC(13,6));',
      `IF NOT EXISTS (${objetivo})`,
      throwSql(SQL_NO_EXISTE, `La cobertura ${ccob} no tiene la tarifa ${ctar} 'V' en la versión vigente del plan ${cplan.trim()}.`),
      `;WITH t AS (${objetivo})
       UPDATE t SET ${sets.join(', ')}, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
       OUTPUT deleted.msumamin, deleted.msumamax, deleted.mprima, deleted.pprima, inserted.msumamin, inserted.msumamax, inserted.mprima, inserted.pprima INTO @r;`,
      "IF EXISTS (SELECT 1 FROM @r WHERE ISNULL(msumamax, 0) > 0 AND ISNULL(msumamin, 0) > msumamax)",
      throwSql(SQL_INVALIDO, 'msumamin quedaría mayor que msumamax.'),
      'IF EXISTS (SELECT 1 FROM @r WHERE ISNULL(mprima, 0) > 0 AND ISNULL(pprima, 0) > 0)',
      throwSql(SQL_INVALIDO, 'La prima y la tasa quedarían las dos mayores que 0 (son excluyentes).'),
    ]) + '\nSELECT * FROM @r;'));
    const f = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    const n = (v: unknown) => (v == null ? null : Number(v));
    this.logger.log(`maplantar ${cramo}/${cplan.trim()} ${ccob}/${ctar}: ${JSON.stringify(f)}`);
    return {
      cramo, cplan: cplan.trim(), ccobertura: ccob, ctarifa: ctar,
      antes: { msumamin: n(f.msumamin_a), msumamax: n(f.msumamax_a), mprima: n(f.mprima_a), pprima: n(f.pprima_a) },
      despues: { msumamin: n(f.msumamin), msumamax: n(f.msumamax), mprima: n(f.mprima), pprima: n(f.pprima) },
      ajustes,
    };
  }

  /**
   * Baja: iestado 'I' en maplancob y en maplantar de la versión vigente (no borra). 409 si es la última cobertura
   * obligatoria del plan (obligatoria = matarifa.bobligatoria 'T'/'1' de alguna de sus tarifas activas).
   */
  async bajaCobertura(cramo: number, cplan: string, ccobertura: string) {
    exigirBandera(BANDERA_PLANES, 'planes');
    await this.exigirTabla(cramo, cplan, 'maplanes');
    const ccob = ccobertura.trim();
    const req = this.planReq(cramo, cplan);
    req.input('ccob', sql.Char(4), ccob);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const obligatorias = `SELECT DISTINCT t.ccober FROM maplantar t
      INNER JOIN matarifa m ON m.cramo = t.cramo AND m.ccober = t.ccober AND m.ctarifa = t.ctarifa
      INNER JOIN maplancob c ON c.cramo = t.cramo AND c.cplan = t.cplan AND c.fdesde_plan = t.fdesde_plan AND c.ccobertura = t.ccober
        AND ISNULL(c.iestado, 'V') <> 'I'
      WHERE t.cramo = @cramo AND t.cplan = @cplan AND t.fdesde_plan = @vig AND t.iestado = 'V' AND RTRIM(m.bobligatoria) IN ('T', '1')`;
    const r = await escribirSql(this.logger, 'dar de baja la cobertura del plan', () => req.query(lote([
      `DECLARE @vig DATETIME = (SELECT MAX(fdesde_plan) FROM maplanes WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V');`,
      `IF NOT EXISTS (SELECT 1 FROM maplancob WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig
         AND ccobertura = @ccob AND ISNULL(iestado, 'V') <> 'I')`,
      throwSql(SQL_NO_EXISTE, `La cobertura ${ccob} no está activa en la versión vigente del plan ${cplan.trim()}.`),
      'DECLARE @ob TABLE (ccober CHAR(4));',
      `INSERT INTO @ob (ccober) ${obligatorias};`,
      'IF EXISTS (SELECT 1 FROM @ob WHERE ccober = @ccob) AND (SELECT COUNT(*) FROM @ob) = 1',
      throwSql(SQL_CONFLICTO, `La cobertura ${ccob} es la última obligatoria del plan: agrega otra obligatoria antes de darla de baja.`),
      `UPDATE maplancob SET iestado = 'I', fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
       WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccobertura = @ccob AND ISNULL(iestado, 'V') <> 'I';`,
      'DECLARE @nc INT = @@ROWCOUNT;',
      `UPDATE maplantar SET iestado = 'I', fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
       WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccober = @ccob AND iestado = 'V';`,
      'DECLARE @nt INT = @@ROWCOUNT;',
    ]) + '\nSELECT @nc AS coberturas, @nt AS tarifas, CONVERT(varchar(10), @vig, 23) AS fdesde_plan;'));
    const f = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    const { familia } = await this.configurador.familiaDeRamo(cramo);
    this.logger.log(`maplancob/maplantar baja ${cramo}/${cplan.trim()} ${ccob}: ${JSON.stringify(f)}`);
    return {
      cramo, cplan: cplan.trim(), ccobertura: ccob, fdesde_plan: rtrim(f.fdesde_plan), iestado: 'I',
      filas: { maplancob: Number(f.coberturas ?? 0), maplantar: Number(f.tarifas ?? 0) },
      advertencias: familia === 'auto' ? [AVISO_CALCULO_AUTO] : [],
    };
  }

  // ── Coberturas de personas (maplcober_per + mapltarifas_per) ───────────────

  /**
   * Agrega la cobertura a la versión vigente del plan de personas con una tarifa por parentesco. 409 si ya está
   * activa. Si estaba dada de baja ('I') se reactiva. Avisa los parentescos que no tienen fila en mapledades_per.
   */
  async agregarCoberturaPersonas(cramo: number, cplan: string, dto: CoberturaPersonasDto) {
    exigirBandera(BANDERA_PLANES, 'planes');
    const errores = validarCoberturaPersonas(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await this.exigirTabla(cramo, cplan, 'maplanes_per');
    const ccob = dto.ccobertura.trim();
    const ctar = dto.ctarifa.trim();
    await this.tarifaRamo(cramo, ccob, ctar);
    const pars = dto.parentescos.map((p) => ({ cparen: p.cparen, csexo: sexoTarifa(p.csexo), ctablatar: p.ctablatar.trim() }));
    await this.exigirParentescosYTablas(pars);

    const req = this.planReq(cramo, cplan);
    req.input('ccob', sql.Char(4), ccob);
    req.input('ctar', sql.Char(4), ctar);
    req.input('oblig', sql.Bit, dto.bobligatoria ?? true);
    req.input('pars', sql.NVarChar(sql.MAX), JSON.stringify(pars));
    auditoriaSql(req);
    const r = await escribirSql(this.logger, 'agregar la cobertura al plan de personas', () => req.query(lote([
      `DECLARE @vig DATETIME = (SELECT MAX(fdesde_plan) FROM maplanes_per WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V');`,
      'IF @vig IS NULL',
      throwSql(SQL_NO_EXISTE, `El plan ${cplan.trim()} no tiene versión 'V' en maplanes_per.`),
      'DECLARE @fh DATETIME = (SELECT fhasta_plan FROM maplanes_per WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig);',
      `IF EXISTS (SELECT 1 FROM maplcober_per WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig
         AND ccobertura = @ccob AND ISNULL(iestado, 'V') <> 'I')`,
      throwSql(SQL_CONFLICTO, `La cobertura ${ccob} ya está activa en la versión vigente del plan.`),
      `IF EXISTS (SELECT 1 FROM mapltarifas_per WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccobertura = @ccob)`,
      throwSql(SQL_CONFLICTO, `La cobertura ${ccob} todavía tiene tarifas por parentesco en mapltarifas_per: revísalas antes de agregarla.`),
      "DECLARE @accion VARCHAR(12) = 'creada';",
      `DECLARE @fcob DATETIME = (SELECT MAX(fdesde_cob) FROM maplcober_per WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig
         AND ccobertura = @ccob AND iestado = 'I');`,
      `IF @fcob IS NULL
       BEGIN
         SET @fcob = @vig;
         INSERT INTO maplcober_per (cramo, cplan, ccobertura, fdesde_plan, u_version, fdesde_cob, fhasta_cob, ccoberdepe, bfraded, mdedu_fran,
           mdedu_franext, pdedu_fran, brutcal, bprocent, bprocsal, bobligatoria, nmax_deduci, mmax_desem, mmax_desemext, pcoa_emp, cramoint,
           ccoberturaint, iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
         SELECT @cramo, @cplan, @ccob, @vig, '!', @fcob, @fh, '0', 'N', 0, 0, 0, 1, 0, 0, @oblig, 0, 0, 0, 0, cramoint, ccoberturaint, 'V',
           @cprog, @ifuente, GETDATE(), @cusuario, 1
         FROM macoberturas WHERE cramo = @cramo AND ccobertura = @ccob;
       END
       ELSE
       BEGIN
         UPDATE maplcober_per SET iestado = 'V', bobligatoria = @oblig, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
         WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccobertura = @ccob AND fdesde_cob = @fcob;
         SET @accion = 'reactivada';
       END`,
      `INSERT INTO mapltarifas_per (cramo, cplan, fdesde_plan, ccobertura, fdesde_cob, ctarifa, cparen, csexo, fdesde_tar, u_version, fhasta_tar,
         ctablatar, cprog, ifuente, fingreso, cusuario, ccategoria)
       SELECT @cramo, @cplan, @vig, @ccob, @fcob, @ctar, j.cparen, j.csexo, @fcob, '!', @fh, j.ctablatar, @cprog, @ifuente, GETDATE(), @cusuario, 1
       FROM OPENJSON(@pars) WITH (cparen SMALLINT '$.cparen', csexo CHAR(1) '$.csexo', ctablatar CHAR(10) '$.ctablatar') j;`,
    ]) + `
SELECT @accion AS accion, CONVERT(varchar(10), @vig, 23) AS fdesde_plan, CONVERT(varchar(10), @fcob, 23) AS fdesde_cob;
SELECT j.cparen FROM OPENJSON(@pars) WITH (cparen SMALLINT '$.cparen') j
WHERE NOT EXISTS (SELECT 1 FROM mapledades_per e WHERE e.cramo = @cramo AND e.cplan = @cplan AND e.fdesde_plan = @vig AND e.cparen = j.cparen);`));
    const [res, sinEdad] = r.recordsets as unknown as Record<string, unknown>[][];
    const f = (res?.[0] ?? {}) as Record<string, unknown>;
    const faltan = [...new Set((sinEdad ?? []).map((x) => Number(x.cparen)))];
    this.logger.log(`maplcober_per/mapltarifas_per alta ${cramo}/${cplan.trim()} ${ccob}/${ctar}: ${rtrim(f.accion)}, ${pars.length} parentescos`);
    return {
      cramo, cplan: cplan.trim(), ccobertura: ccob, ctarifa: ctar, fdesde_plan: rtrim(f.fdesde_plan), fdesde_cob: rtrim(f.fdesde_cob),
      accion: rtrim(f.accion), parentescos: pars,
      advertencias: faltan.length
        ? [`Parentesco(s) ${faltan.join(', ')} sin edades en mapledades_per: complétalas con PUT planes/${cramo}/${cplan.trim()}/edades/:cparen.`]
        : [],
    };
  }

  /**
   * Baja de una cobertura de personas: iestado 'I' en maplcober_per y borrado de sus filas de mapltarifas_per (no tiene
   * iestado). Se borran porque los SP de cálculo y emisión de personas no filtran maplcober_per.iestado: sin tarifas
   * la cobertura deja de cotizarse. La respuesta trae las tarifas borradas (respaldo). 409 si es la última obligatoria.
   */
  async bajaCoberturaPersonas(cramo: number, cplan: string, ccobertura: string) {
    exigirBandera(BANDERA_PLANES, 'planes');
    await this.exigirTabla(cramo, cplan, 'maplanes_per');
    const ccob = ccobertura.trim();
    const req = this.planReq(cramo, cplan);
    req.input('ccob', sql.Char(4), ccob);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const activa = "cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ISNULL(iestado, 'V') <> 'I'";
    const r = await escribirSql(this.logger, 'dar de baja la cobertura del plan de personas', () => req.query(lote([
      `DECLARE @vig DATETIME = (SELECT MAX(fdesde_plan) FROM maplanes_per WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V');`,
      `IF NOT EXISTS (SELECT 1 FROM maplcober_per WITH (UPDLOCK, HOLDLOCK) WHERE ${activa} AND ccobertura = @ccob)`,
      throwSql(SQL_NO_EXISTE, `La cobertura ${ccob} no está activa en la versión vigente del plan ${cplan.trim()}.`),
      `IF EXISTS (SELECT 1 FROM maplcober_per WHERE ${activa} AND ccobertura = @ccob AND bobligatoria = 1)
         AND NOT EXISTS (SELECT 1 FROM maplcober_per WHERE ${activa} AND ccobertura <> @ccob AND bobligatoria = 1)`,
      throwSql(SQL_CONFLICTO, `La cobertura ${ccob} es la última obligatoria del plan: agrega otra obligatoria antes de darla de baja.`),
      `DECLARE @b TABLE (cramo SMALLINT, cplan CHAR(6), fdesde_plan DATETIME, ccobertura CHAR(4), fdesde_cob DATETIME, ctarifa CHAR(4), cparen SMALLINT,
         csexo CHAR(1), fdesde_tar DATETIME, u_version CHAR(1), fhasta_tar DATETIME, ctablatar CHAR(10), cprog CHAR(20), ifuente CHAR(10),
         fingreso DATETIME, cusuario NUMERIC(11), fultmod DATETIME, ccategoria SMALLINT, cusuariomod NUMERIC(11), ccategoriamod SMALLINT);`,
      `UPDATE maplcober_per SET iestado = 'I', fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
       WHERE ${activa} AND ccobertura = @ccob;`,
      `DELETE FROM mapltarifas_per
       OUTPUT deleted.cramo, deleted.cplan, deleted.fdesde_plan, deleted.ccobertura, deleted.fdesde_cob, deleted.ctarifa, deleted.cparen, deleted.csexo,
         deleted.fdesde_tar, deleted.u_version, deleted.fhasta_tar, deleted.ctablatar, deleted.cprog, deleted.ifuente, deleted.fingreso, deleted.cusuario,
         deleted.fultmod, deleted.ccategoria, deleted.cusuariomod, deleted.ccategoriamod INTO @b
       WHERE cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND ccobertura = @ccob;`,
    ]) + `
SELECT * FROM @b ORDER BY cparen, csexo;
SELECT DISTINCT b.cparen FROM @b b
WHERE NOT EXISTS (SELECT 1 FROM mapltarifas_per t WHERE t.cramo = @cramo AND t.cplan = @cplan AND t.cparen = b.cparen);`));
    const [borradas, huerfanos] = r.recordsets as unknown as Record<string, unknown>[][];
    const sinTarifa = (huerfanos ?? []).map((x) => Number(x.cparen));
    this.logger.warn(`maplcober_per baja ${cramo}/${cplan.trim()} ${ccob}; mapltarifas_per borradas: ${JSON.stringify((borradas ?? []).map(filaPlana))}`);
    return {
      cramo, cplan: cplan.trim(), ccobertura: ccob, iestado: 'I',
      tarifasBorradas: (borradas ?? []).map(filaPlana),
      advertencias: sinTarifa.length
        ? [`Parentesco(s) ${sinTarifa.join(', ')} quedaron sin tarifas en el plan; su fila de mapledades_per se conserva.`]
        : [],
    };
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private planReq(cramo: number, cplan: string) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    return req;
  }

  /** Cabecera del plan; si está en las dos tablas, decide la familia del ramo. */
  private async cabecera(cramo: number, cplan: string): Promise<CabeceraPlan> {
    const cab = await cabeceraPlan(() => this.db.request(), cramo, cplan);
    if (!cab.enAmbas) return cab;
    const { familia } = await this.configurador.familiaDeRamo(cramo);
    return cabeceraPlan(() => this.db.request(), cramo, cplan, familia === 'personas' ? 'maplanes_per' : 'maplanes');
  }

  /** 400 si el plan no es de la tabla esperada (patrimonial/auto → maplanes; personas → maplanes_per). */
  private async exigirTabla(cramo: number, cplan: string, tabla: TablaPlan): Promise<CabeceraPlan> {
    const cab = await this.cabecera(cramo, cplan);
    if (cab.tabla !== tabla) {
      throw new BadRequestException(
        tabla === 'maplanes'
          ? `El plan ${cplan.trim()} es de personas (maplanes_per): usa planes/${cramo}/${cplan.trim()}/coberturas-personas.`
          : `El plan ${cplan.trim()} es de patrimonial o auto (maplanes): usa planes/${cramo}/${cplan.trim()}/coberturas.`,
      );
    }
    return cab;
  }

  /** La cobertura existe en el ramo y la tarifa está 'V' en matarifa. Devuelve bobligatoria y cuántos detalles 'V' tiene. */
  private async tarifaRamo(cramo: number, ccob: string, ctar: string) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('ccob', sql.Char(4), ccob);
    req.input('ctar', sql.Char(4), ctar);
    const r = await req.query(`
      SELECT CASE WHEN EXISTS (SELECT 1 FROM macoberturas WITH (NOLOCK) WHERE cramo = @cramo AND ccobertura = @ccob) THEN 1 ELSE 0 END AS cob;
      SELECT TOP 1 RTRIM(bobligatoria) AS bobligatoria,
        (SELECT COUNT(*) FROM matarifa_d d WITH (NOLOCK) WHERE d.cramo = @cramo AND d.ccober = @ccob AND d.ctarifa = @ctar AND d.iestado = 'V') AS detalles
      FROM matarifa WITH (NOLOCK) WHERE cramo = @cramo AND ccober = @ccob AND ctarifa = @ctar AND iestado = 'V';`);
    const [cob, tar] = r.recordsets as unknown as Record<string, unknown>[][];
    if (Number(cob?.[0]?.cob) !== 1) throw new BadRequestException(`La cobertura ${ccob} no existe en el ramo ${cramo}.`);
    const t = tar?.[0];
    if (!t) throw new BadRequestException(`La cobertura ${ccob} no tiene la tarifa ${ctar} vigente en el ramo ${cramo}.`);
    return { bobligatoria: rtrim(t.bobligatoria), detallesV: Number(t.detalles ?? 0) };
  }

  /** Parentescos en maparent y tablas de tasas con tramos en mapltabedad_d. */
  private async exigirParentescosYTablas(pars: { cparen: number; ctablatar: string }[]) {
    const req = this.db.request();
    req.input('pars', sql.NVarChar(sql.MAX), JSON.stringify(pars));
    const r = await req.query(`
      SELECT DISTINCT j.cparen FROM OPENJSON(@pars) WITH (cparen SMALLINT '$.cparen') j
      WHERE NOT EXISTS (SELECT 1 FROM maparent p WITH (NOLOCK) WHERE p.cparentesco = j.cparen);
      SELECT DISTINCT RTRIM(j.ctablatar) AS ctablatar FROM OPENJSON(@pars) WITH (ctablatar CHAR(10) '$.ctablatar') j
      WHERE NOT EXISTS (SELECT 1 FROM mapltabedad_d d WITH (NOLOCK) WHERE d.ctablaedad = j.ctablatar);`);
    const [paren, tablas] = r.recordsets as unknown as Record<string, unknown>[][];
    const errores: string[] = [];
    if (paren?.length) errores.push(`Parentesco(s) que no existen en maparent: ${paren.map((x) => x.cparen).join(', ')}.`);
    if (tablas?.length) errores.push(`Tabla(s) de tasas sin tramos en mapltabedad_d: ${tablas.map((x) => rtrim(x.ctablatar)).join(', ')}.`);
    if (errores.length) throw new BadRequestException(errores.join(' '));
  }
}
