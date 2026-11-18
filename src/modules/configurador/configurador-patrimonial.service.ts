import { BadRequestException, Injectable, Logger, NotFoundException, NotImplementedException } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { TABLAS_CONDOMINIO, tablasCondominioExistentes } from './configurador-ramos';
import {
  DISPOSITIVOS, MENSAJE_CONDOMINIO_ESCRITURA, SUSTANCIAS, avisosReparto, tablaCondominio, validarPorcentaje,
  type CambioPorcentaje, type TablaPorcentaje,
} from './configurador-patrimonial';
import { SQL_CONFLICTO, SQL_NO_EXISTE, auditoriaSql, escribirSql, exigirBandera, existeSql, lote, rtrim, throwSql } from './configurador.comun';

/** Bandera de escritura de la familia patrimonial (madisseg, masustac y condominio). Apagada por defecto. */
export const BANDERA_PATRIMONIAL = 'CONFIGURADOR_PATRIMONIAL_ESCRITURA';

type Fila = Record<string, unknown>;
export type TipoPorcentaje = 'dispositivos' | 'sustancias';
const TABLA: Record<TipoPorcentaje, TablaPorcentaje> = { dispositivos: DISPOSITIVOS, sustancias: SUSTANCIAS };

const numOrNull = (v: unknown) => (v == null ? null : Number(v));

/**
 * Familia patrimonial, por ramo: dispositivos de seguridad (madisseg, % de descuento) y sustancias peligrosas
 * (masustac, % de recargo). Sin iestado en ninguna: alta y edición, nunca DELETE («quitar» = % en 0). Condominio
 * (MATARIFA_*_NEXUS): solo lectura aquí; la escritura es del tarificador de condominio (ver MENSAJE_CONDOMINIO_ESCRITURA).
 * Los nombres de tabla y columna salen de constantes del código, nunca del usuario.
 */
@Injectable()
export class ConfiguradorPatrimonialService {
  private readonly logger = new Logger(ConfiguradorPatrimonialService.name);

  constructor(private readonly db: MssqlService) {}

  // ── Dispositivos y sustancias ──────────────────────────────────────────────

  async listar(tipo: TipoPorcentaje, cramo: number) {
    const t = TABLA[tipo];
    await this.exigirRamo(cramo);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query(`SELECT ${t.codigo} AS codigo, RTRIM(${t.descripcion}) AS descripcion, ${t.porcentaje} AS porcentaje
      FROM ${t.tabla} WITH (NOLOCK) WHERE cramo = @cramo ORDER BY ${t.codigo}`);
    return ((r.recordset ?? []) as Fila[]).map((f) => this.salida(t, f));
  }

  /** Alta en una transacción: código propio (409 si existe) o MAX+1 del ramo con UPDLOCK, HOLDLOCK. */
  async crear(tipo: TipoPorcentaje, cramo: number, c: CambioPorcentaje) {
    const t = TABLA[tipo];
    exigirBandera(BANDERA_PATRIMONIAL, `${t.nombre} (${t.tabla})`);
    this.exigirReglas(validarPorcentaje(t, c, true));
    await this.exigirRamo(cramo);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('codigo', sql.SmallInt, c.codigo ?? null);
    req.input('descripcion', sql.VarChar(t.largo), String(c.descripcion).trim());
    req.input('porcentaje', sql.Numeric(t.decimales === 6 ? 13 : 11, t.decimales), c.porcentaje);
    auditoriaSql(req);
    const r = await escribirSql(this.logger, `crear el ${t.nombre}`, () => req.query(lote([
      'DECLARE @c SMALLINT = @codigo;',
      'IF @c IS NULL',
      `BEGIN\n  SET @c = (SELECT ISNULL(MAX(${t.codigo}), 0) + 1 FROM ${t.tabla} WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo);\nEND`,
      `ELSE IF EXISTS (SELECT 1 FROM ${t.tabla} WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND ${t.codigo} = @c)`,
      throwSql(SQL_CONFLICTO, `Ya existe ese código de ${t.nombre} en el ramo (${t.tabla}).`),
      `INSERT INTO ${t.tabla} (cramo, ${t.codigo}, u_version, ${t.descripcion}, ${t.porcentaje}, cprog, ifuente, fingreso, cusuario, ccategoria)
       VALUES (@cramo, @c, '!', @descripcion, @porcentaje, @cprog, @ifuente, GETDATE(), @cusuario, 1);`,
      'SELECT @c AS codigo;',
    ])));
    const codigo = Number(r.recordset?.[0]?.codigo);
    this.logger.warn(`${t.tabla} alta ramo ${cramo} código ${codigo}: ${c.porcentaje} %`);
    return { cramo, ...this.salida(t, { codigo, descripcion: c.descripcion, porcentaje: c.porcentaje }) };
  }

  /** Edición de los campos enviados; devuelve antes y después (respaldo del builder). 404 si no existe. */
  async editar(tipo: TipoPorcentaje, cramo: number, codigo: number, c: CambioPorcentaje) {
    const t = TABLA[tipo];
    exigirBandera(BANDERA_PATRIMONIAL, `${t.nombre} (${t.tabla})`);
    this.exigirReglas(validarPorcentaje(t, { ...c, codigo }, false));
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('codigo', sql.SmallInt, codigo);
    auditoriaSql(req);
    const sets: string[] = [];
    if (c.descripcion !== undefined) {
      req.input('descripcion', sql.VarChar(t.largo), String(c.descripcion ?? '').trim());
      sets.push(`${t.descripcion} = @descripcion`);
    }
    if (c.porcentaje !== undefined) {
      req.input('porcentaje', sql.Numeric(t.decimales === 6 ? 13 : 11, t.decimales), c.porcentaje);
      sets.push(`${t.porcentaje} = @porcentaje`);
    }
    const k = `cramo = @cramo AND ${t.codigo} = @codigo`;
    const r = await escribirSql(this.logger, `editar el ${t.nombre}`, () => req.query(lote([
      `IF NOT EXISTS (SELECT 1 FROM ${t.tabla} WITH (UPDLOCK, HOLDLOCK) WHERE ${k})`,
      throwSql(SQL_NO_EXISTE, `No existe ese código de ${t.nombre} en el ramo (${t.tabla}).`),
      `SELECT ${t.codigo} AS codigo, RTRIM(${t.descripcion}) AS descripcion, ${t.porcentaje} AS porcentaje FROM ${t.tabla} WHERE ${k};`,
      `UPDATE ${t.tabla} SET ${[...sets, 'fultmod = GETDATE()', 'cusuariomod = @cusuario', 'ccategoriamod = 1'].join(', ')} WHERE ${k};`,
      `SELECT ${t.codigo} AS codigo, RTRIM(${t.descripcion}) AS descripcion, ${t.porcentaje} AS porcentaje FROM ${t.tabla} WHERE ${k};`,
    ])));
    const [antes, despues] = r.recordsets as unknown as Fila[][];
    this.logger.warn(`${t.tabla} edición ramo ${cramo} código ${codigo}: ${JSON.stringify(antes?.[0])} → ${JSON.stringify(despues?.[0])}`);
    return { cramo, antes: this.salida(t, antes[0]), despues: this.salida(t, despues[0]) };
  }

  // ── Condominio (MATARIFA_*_NEXUS) ──────────────────────────────────────────

  /** Filas del ramo en una tabla de condominio. disponible: false si la tabla no existe en esta base. */
  async leerCondominio(cramo: number, param: string) {
    const corta = this.exigirTablaCondominio(param);
    const tabla = TABLAS_CONDOMINIO[corta];
    await this.exigirRamo(cramo);
    const existentes = await tablasCondominioExistentes(this.db);
    if (!existentes.includes(tabla)) return { cramo, tabla: corta, nombreTabla: tabla, disponible: false, filas: [], avisos: [] };
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    // SELECT *: las columnas opcionales (iopcional, plimite del reparto) dependen del script aplicado en cada base.
    const r = await req.query(`SELECT * FROM dbo.${tabla} WITH (NOLOCK) WHERE cramo = @cramo`);
    const filas = ((r.recordset ?? []) as Fila[]).map((f) =>
      Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])));
    return { cramo, tabla: corta, nombreTabla: tabla, disponible: true, filas, avisos: corta === 'reparto' ? avisosReparto(filas) : [] };
  }

  /** La escritura de condominio no se duplica: 501 con la razón (ver MENSAJE_CONDOMINIO_ESCRITURA). */
  escribirCondominio(param: string): never {
    this.exigirTablaCondominio(param);
    throw new NotImplementedException(MENSAJE_CONDOMINIO_ESCRITURA);
  }

  private exigirTablaCondominio(param: string) {
    const corta = tablaCondominio(param);
    if (!corta) throw new BadRequestException(`Tabla de condominio desconocida: ${String(param).slice(0, 40)} (usa antiguedad, reparto o rango).`);
    return corta;
  }

  private salida(t: TablaPorcentaje, f: Fila | undefined) {
    return {
      [t.codigo]: numOrNull(f?.codigo),
      [t.descripcion]: f?.descripcion == null ? null : rtrim(f.descripcion),
      [t.porcentaje]: numOrNull(f?.porcentaje),
    };
  }

  private async exigirRamo(cramo: number) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    if (!(await existeSql(req, 'SELECT 1 FROM maramos WITH (NOLOCK) WHERE cramo = @cramo'))) throw new NotFoundException(`No existe el ramo ${cramo}.`);
  }

  private exigirReglas(errores: string[]) {
    if (errores.length) throw new BadRequestException(errores.join(' '));
  }
}
