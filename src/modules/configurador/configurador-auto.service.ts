import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import {
  MONTOS_TIPO_USO, PORCENTAJES_TIPO_USO, avisosTramosAntiguedad, equivalenteRamo18, esCasco, validarTipoUso, validarTramosAntiguedad,
  type CoberturaInt,
} from './configurador.auto';
import {
  SQL_CONFLICTO, auditoriaSql, escribirSql, exigirBandera, exigirPlanSql, existeSql, lote, rtrim, throwSql, type TipoSql,
} from './configurador.comun';
import { TasasAntiguedadDto, TipoUsoDto } from './dto/configurador-auto.dto';

/** Bandera de escritura de auto (macattip y maplantar_ano). Apagada por defecto. */
export const BANDERA_AUTO = 'CONFIGURADOR_AUTO_ESCRITURA';

type Fila = Record<string, unknown>;

/** Columnas editables de macattip con su tipo SQL (nombres fijos del código, nunca del usuario). */
const COLUMNAS_TIPO_USO: Array<[keyof TipoUsoDto & string, () => TipoSql]> = [
  ['ccober', () => sql.Char(4)],
  ['ctarifa', () => sql.Char(4)],
  ['ptasaexc', () => sql.Numeric(13, 6)],
  ...MONTOS_TIPO_USO.map((c) => [c, () => sql.Numeric(17, 2)] as [keyof TipoUsoDto & string, () => TipoSql]),
  ...PORCENTAJES_TIPO_USO.filter((c) => c !== 'ptasaexc').map((c) => [c, () => sql.Numeric(11, 4)] as [keyof TipoUsoDto & string, () => TipoSql]),
  ['qmaxptos', () => sql.TinyInt()],
  ['qmaxton', () => sql.SmallInt()],
];

const numOrNull = (v: unknown) => (v == null ? null : Number(v));

/** Planes 'V' del ramo (los que usan macattip del ramo). Usa @cramo. */
const SQL_PLANES_AFECTADOS = `SELECT DISTINCT RTRIM(cplan) AS cplan FROM maplanes WITH (NOLOCK) WHERE cramo = @cramo AND iestado = 'V' ORDER BY 1`;

/**
 * Familia auto: tipo y uso por ramo (macattip, afecta a todos los planes del ramo; sp_calculo_auto_nexus lo une sin
 * cramo) y tasas de casco por antigüedad del vehículo por plan (maplantar_ano). Sin baja de macattip en esta fase.
 */
@Injectable()
export class ConfiguradorAutoService {
  private readonly logger = new Logger(ConfiguradorAutoService.name);

  constructor(private readonly db: MssqlService) {}

  // ── Catálogos ──────────────────────────────────────────────────────────────

  async listarTipos(cramo: number) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query('SELECT ctipo, RTRIM(xtipo) AS xtipo FROM matipos WITH (NOLOCK) WHERE cramo = @cramo ORDER BY ctipo');
    return ((r.recordset ?? []) as Fila[]).map((f) => ({ ctipo: Number(f.ctipo), xtipo: rtrim(f.xtipo) }));
  }

  async listarUsos(cramo: number) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query(`SELECT ctipo, ccategotr, RTRIM(xcategoria) AS xcategoria FROM macategtr WITH (NOLOCK)
      WHERE cramo = @cramo ORDER BY ctipo, ccategotr`);
    return ((r.recordset ?? []) as Fila[]).map((f) => ({ ctipo: numOrNull(f.ctipo), ccategotr: Number(f.ccategotr), xcategoria: rtrim(f.xcategoria) }));
  }

  // ── Tipo y uso (macattip) ──────────────────────────────────────────────────

  /** Filas de macattip del ramo con descripciones, ramos donde se repite cada par y los planes 'V' afectados. */
  async listarTiposUso(cramo: number) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query(`
      SELECT a.ctipo, a.ccategotr, RTRIM(a.ccober) AS ccober, RTRIM(a.ctarifa) AS ctarifa, a.mprimbas, a.mprimext, a.msumacosas,
             a.msumapers, a.msumacosasext, a.msumapersext, a.ptasaexc, a.pdescuento, a.precarofic, a.precarinfl, a.precarremo,
             a.mtoneladas, a.mpuestos, a.qmaxptos, a.qmaxton, t.xtipo, c.xcategoria
      FROM macattip a WITH (NOLOCK)
      OUTER APPLY (SELECT TOP 1 RTRIM(x.xtipo) AS xtipo FROM matipos x WITH (NOLOCK) WHERE x.cramo = a.cramo AND x.ctipo = a.ctipo) t
      OUTER APPLY (SELECT TOP 1 RTRIM(y.xcategoria) AS xcategoria FROM macategtr y WITH (NOLOCK)
                   WHERE y.cramo = a.cramo AND y.ccategotr = a.ccategotr ORDER BY CASE WHEN y.ctipo = a.ctipo THEN 0 ELSE 1 END) c
      WHERE a.cramo = @cramo
      ORDER BY a.ctipo, a.ccategotr;
      SELECT DISTINCT b.cramo, b.ctipo, b.ccategotr FROM macattip b WITH (NOLOCK)
      WHERE b.cramo <> @cramo AND EXISTS (SELECT 1 FROM macattip a WITH (NOLOCK) WHERE a.cramo = @cramo AND a.ctipo = b.ctipo AND a.ccategotr = b.ccategotr);
      ${SQL_PLANES_AFECTADOS};`);
    const [filas, otros, planes] = r.recordsets as unknown as Fila[][];
    const otrosRamos = (ctipo: unknown, ccat: unknown) =>
      otros.filter((o) => Number(o.ctipo) === Number(ctipo) && Number(o.ccategotr) === Number(ccat)).map((o) => Number(o.cramo)).sort((a, b) => a - b);
    return {
      filas: filas.map((f) => ({
        ctipo: Number(f.ctipo),
        ccategotr: Number(f.ccategotr),
        xtipo: f.xtipo == null ? null : rtrim(f.xtipo),
        xcategoria: f.xcategoria == null ? null : rtrim(f.xcategoria),
        ccober: f.ccober == null ? null : rtrim(f.ccober),
        ctarifa: f.ctarifa == null ? null : rtrim(f.ctarifa),
        ...Object.fromEntries([...MONTOS_TIPO_USO, ...PORCENTAJES_TIPO_USO, 'qmaxptos', 'qmaxton'].map((c) => [c, numOrNull(f[c])])),
        otrosRamos: otrosRamos(f.ctipo, f.ccategotr),
      })),
      planesAfectados: planes.map((p) => rtrim(p.cplan)),
    };
  }

  /**
   * Upsert de una fila de macattip (cramo, ctipo, ccategotr): solo los campos enviados. Valida catálogos y rangos.
   * Si el par existe en otro ramo, devuelve advertencias y solo graba con confirmar: true. 409 si la fila está repetida.
   */
  async guardarTipoUso(cramo: number, ctipo: number, ccategotr: number, dto: TipoUsoDto) {
    exigirBandera(BANDERA_AUTO, 'auto (tipo y uso)');
    const errores = validarTipoUso(dto);
    if (!Number.isInteger(ctipo) || ctipo < 0 || ctipo > 99) errores.push('ctipo debe ser un entero entre 0 y 99 (NUMERIC(2)).');
    if (!Number.isInteger(ccategotr) || ccategotr < 0 || ccategotr > 32767) errores.push('ccategotr debe ser un entero entre 0 y 32767.');
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await this.exigirCatalogosTipoUso(cramo, ctipo, ccategotr, dto);

    const base = () => {
      const r = this.db.request();
      r.input('cramo', sql.SmallInt, cramo);
      r.input('ctipo', sql.Numeric(2, 0), ctipo);
      r.input('ccat', sql.SmallInt, ccategotr);
      return r;
    };
    const lectura = await base().query(`
      SELECT DISTINCT cramo FROM macattip WITH (NOLOCK) WHERE ctipo = @ctipo AND ccategotr = @ccat AND cramo <> @cramo ORDER BY cramo;
      ${SQL_PLANES_AFECTADOS};`);
    const [otros, planes] = lectura.recordsets as unknown as Fila[][];
    const planesAfectados = planes.map((p) => rtrim(p.cplan));
    const advertencias: string[] = [];
    if (otros.length) {
      advertencias.push(
        `El par tipo ${ctipo} / uso ${ccategotr} también existe en el/los ramo(s) ${otros.map((o) => Number(o.cramo)).join(', ')}: ` +
          'sp_calculo_auto_nexus lo busca sin ramo, así que puede tomar la fila de otro ramo.',
      );
    }
    if (advertencias.length && dto.confirmar !== true) {
      return { cramo, ctipo, ccategotr, grabado: false, accion: null, advertencias, planesAfectados };
    }

    const req = base();
    auditoriaSql(req);
    const cols = COLUMNAS_TIPO_USO.filter(([c]) => dto[c] !== undefined);
    for (const [c, tipo] of cols) req.input(c, tipo(), dto[c] ?? null);
    const sets = cols.map(([c]) => `${c} = @${c}`);
    const k = 'cramo = @cramo AND ctipo = @ctipo AND ccategotr = @ccat';
    const r = await escribirSql(this.logger, 'guardar el tipo y uso', () => req.query(lote([
      `DECLARE @n INT = (SELECT COUNT(*) FROM macattip WITH (UPDLOCK, HOLDLOCK) WHERE ${k});`,
      'IF @n > 1',
      throwSql(SQL_CONFLICTO, `macattip tiene filas repetidas para tipo ${ctipo} / uso ${ccategotr} en el ramo ${cramo}: corrígelo en Sis2000.`),
      `IF @n = 1
        UPDATE macattip SET ${[...sets, 'fultmod = GETDATE()', 'cusuariomod = @cusuario', 'ccategoriamod = 1'].join(', ')} WHERE ${k};
      ELSE
        INSERT INTO macattip (cramo, ctipo, ccategotr, u_version, ${cols.map(([c]) => `${c}, `).join('')}cprog, ifuente, fingreso, cusuario, ccategoria)
        VALUES (@cramo, @ctipo, @ccat, '!', ${cols.map(([c]) => `@${c}, `).join('')}@cprog, @ifuente, GETDATE(), @cusuario, 1);`,
    ]) + "\nSELECT CASE WHEN @n = 1 THEN 'actualizado' ELSE 'insertado' END AS accion;"));
    const accion = rtrim(r.recordset?.[0]?.accion) as 'actualizado' | 'insertado';
    this.logger.warn(`macattip ${accion} ramo ${cramo} tipo ${ctipo} uso ${ccategotr}; planes afectados: ${planesAfectados.join(', ')}`);
    return { cramo, ctipo, ccategotr, grabado: true, accion, advertencias, planesAfectados };
  }

  // ── Tasas por antigüedad (maplantar_ano) ───────────────────────────────────

  async listarTasas(cramo: number, cplan: string) {
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`
      SELECT RTRIM(ccober) AS ccober, RTRIM(ctarifa) AS ctarifa, nantiguedad_desde, nantiguedad_hasta, pprima, RTRIM(iestado) AS iestado
      FROM maplantar_ano WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan
      ORDER BY ccober, ctarifa, CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, nantiguedad_desde`);
    return ((r.recordset ?? []) as Fila[]).map((f) => ({
      ccober: rtrim(f.ccober), ctarifa: rtrim(f.ctarifa), nantiguedad_desde: Number(f.nantiguedad_desde),
      nantiguedad_hasta: Number(f.nantiguedad_hasta), pprima: Number(f.pprima), iestado: rtrim(f.iestado),
    }));
  }

  /**
   * Reemplaza los tramos 'V' de (plan, cobertura, tarifa) en una transacción: los 'V' actuales pasan a 'I' y los nuevos
   * quedan 'V' (si ya había una fila con el mismo desde, se reutiliza: es parte de la PK). Lista vacía = inactivar todos.
   * Si la cobertura no es de casco (1/2/28 del ramo 18 por ccoberturaint), devuelve la advertencia y solo graba con
   * confirmar: true. Si el último tramo no llega a una antigüedad alta, avisa (no bloquea): los vehículos más viejos no
   * cotizan (THROW 99012).
   */
  async reemplazarTasas(cramo: number, cplan: string, ccober: string, ctarifa: string, dto: TasasAntiguedadDto) {
    exigirBandera(BANDERA_AUTO, 'auto (tasas por antigüedad)');
    const errores = validarTramosAntiguedad(dto.tramos);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const plan = cplan.trim();
    const cob = ccober.trim();
    const tar = ctarifa.trim();
    const base = () => {
      const r = this.db.request();
      r.input('cramo', sql.SmallInt, cramo);
      r.input('cplan', sql.Char(6), plan);
      r.input('ccober', sql.Char(4), cob);
      r.input('ctarifa', sql.Char(4), tar);
      return r;
    };
    if (!(await existeSql(base(), 'SELECT 1 FROM maplantar WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND ccober = @ccober AND ctarifa = @ctarifa'))) {
      throw new BadRequestException(`La cobertura ${cob} con la tarifa ${tar} no está en maplantar del plan ${plan} (ramo ${cramo}).`);
    }

    const lectura = await base().query(`
      SELECT RTRIM(ccobertura) AS ccobertura, ccoberturaint FROM macoberturas WITH (NOLOCK) WHERE cramo = @cramo AND ccobertura = @ccober;
      SELECT RTRIM(m.ccobertura) AS ccobertura, m.ccoberturaint FROM macoberturas m WITH (NOLOCK)
      WHERE m.cramo = 18 AND m.ccoberturaint = (SELECT TOP 1 ccoberturaint FROM macoberturas WITH (NOLOCK) WHERE cramo = @cramo AND ccobertura = @ccober);
      SELECT nantiguedad_desde AS desde, nantiguedad_hasta AS hasta, pprima FROM maplantar_ano WITH (NOLOCK)
      WHERE cramo = @cramo AND cplan = @cplan AND ccober = @ccober AND ctarifa = @ctarifa AND iestado = 'V' ORDER BY nantiguedad_desde;`);
    const [propia, ramo18, antes] = lectura.recordsets as unknown as Fila[][];
    const cobInt: CoberturaInt = { ccobertura: cob, ccoberturaint: numOrNull(propia[0]?.ccoberturaint) };
    const cob18 = equivalenteRamo18(cramo, cobInt, ramo18.map((f) => ({ ccobertura: rtrim(f.ccobertura), ccoberturaint: numOrNull(f.ccoberturaint) })));
    const advertencias: string[] = [];
    if (!esCasco(cob18)) {
      advertencias.push(
        `La cobertura ${cob} no equivale a casco (1, 2 o 28 del ramo 18 por ccoberturaint${cob18 != null ? `; equivale a la ${cob18}` : ''}): ` +
          'sp_calculo_auto_nexus no usará estas tasas.',
      );
    }
    const tramosAntes = antes.map((f) => ({ desde: Number(f.desde), hasta: Number(f.hasta), pprima: Number(f.pprima) }));
    // Solo la cobertura que no es casco exige confirmar; el aviso del último tramo no bloquea.
    const exigeConfirmar = advertencias.length > 0;
    advertencias.push(...avisosTramosAntiguedad(dto.tramos));
    if (exigeConfirmar && dto.confirmar !== true) {
      return { cramo, cplan: plan, ccober: cob, ctarifa: tar, cob18, grabado: false, tramos: 0, antes: tramosAntes, advertencias };
    }

    const req = base();
    auditoriaSql(req);
    const k = 'cramo = @cramo AND cplan = @cplan AND ccober = @ccober AND ctarifa = @ctarifa';
    const sentencias = [
      `UPDATE maplantar_ano SET iestado = 'I', fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
        WHERE ${k} AND iestado = 'V';`,
    ];
    dto.tramos.forEach((t, i) => {
      req.input(`d${i}`, sql.SmallInt, t.desde);
      req.input(`h${i}`, sql.SmallInt, t.hasta);
      req.input(`p${i}`, sql.Numeric(13, 6), t.pprima);
      sentencias.push(`IF EXISTS (SELECT 1 FROM maplantar_ano WHERE ${k} AND nantiguedad_desde = @d${i})
        UPDATE maplantar_ano SET nantiguedad_hasta = @h${i}, pprima = @p${i}, iestado = 'V', fultmod = GETDATE(), cusuariomod = @cusuario,
          ccategoriamod = 1 WHERE ${k} AND nantiguedad_desde = @d${i};
      ELSE
        INSERT INTO maplantar_ano (cramo, cplan, ctarifa, ccober, nantiguedad_desde, nantiguedad_hasta, pprima, u_version, iestado,
          cprog, ifuente, fingreso, cusuario, ccategoria)
        VALUES (@cramo, @cplan, @ctarifa, @ccober, @d${i}, @h${i}, @p${i}, '!', 'V', @cprog, @ifuente, GETDATE(), @cusuario, 1);`);
    });
    await escribirSql(this.logger, 'reemplazar las tasas por antigüedad', () => req.query(lote(sentencias)));
    this.logger.warn(`maplantar_ano ${cramo}/${plan} cob ${cob} tar ${tar}: ${tramosAntes.length} → ${dto.tramos.length} tramos 'V'`);
    return { cramo, cplan: plan, ccober: cob, ctarifa: tar, cob18, grabado: true, tramos: dto.tramos.length, antes: tramosAntes, advertencias };
  }

  /** ctipo en matipos y ccategotr en macategtr del ramo; ccober/ctarifa (si vienen con valor) en macoberturas/matarifa. */
  private async exigirCatalogosTipoUso(cramo: number, ctipo: number, ccategotr: number, dto: TipoUsoDto) {
    const req = () => {
      const r = this.db.request();
      r.input('cramo', sql.SmallInt, cramo);
      r.input('ctipo', sql.Numeric(2, 0), ctipo);
      r.input('ccat', sql.SmallInt, ccategotr);
      r.input('ccober', sql.Char(4), dto.ccober?.trim() ?? null);
      r.input('ctarifa', sql.Char(4), dto.ctarifa?.trim() ?? null);
      return r;
    };
    const errores: string[] = [];
    if (!(await existeSql(req(), 'SELECT 1 FROM matipos WITH (NOLOCK) WHERE cramo = @cramo AND ctipo = @ctipo'))) {
      errores.push(`El tipo ${ctipo} no existe en matipos del ramo ${cramo}.`);
    }
    if (!(await existeSql(req(), 'SELECT 1 FROM macategtr WITH (NOLOCK) WHERE cramo = @cramo AND ccategotr = @ccat'))) {
      errores.push(`El uso ${ccategotr} no existe en macategtr del ramo ${cramo}.`);
    }
    if (dto.ccober && !(await existeSql(req(), 'SELECT 1 FROM macoberturas WITH (NOLOCK) WHERE cramo = @cramo AND ccobertura = @ccober'))) {
      errores.push(`La cobertura ${dto.ccober} no existe en el ramo ${cramo}.`);
    }
    if (dto.ctarifa) {
      const filtro = dto.ccober ? ' AND ccober = @ccober' : '';
      if (!(await existeSql(req(), `SELECT 1 FROM matarifa WITH (NOLOCK) WHERE cramo = @cramo AND ctarifa = @ctarifa${filtro}`))) {
        errores.push(`La tarifa ${dto.ctarifa}${dto.ccober ? ` de la cobertura ${dto.ccober}` : ''} no existe en el ramo ${cramo}.`);
      }
    }
    if (errores.length) throw new BadRequestException(errores.join(' '));
  }
}
