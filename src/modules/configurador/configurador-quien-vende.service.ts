import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { SQL_NO_EXISTE, auditoriaSql, escribirSql, exigirBandera, exigirPlanSql, lote, rtrim, throwSql } from './configurador.comun';
import { BANDERA_QUIEN_VENDE, filaPlana } from './configurador-fase2.comun';
import {
  NOMBRE_ENTIDAD, armarResumen, avisosContrarios, normalizarItems, paginado, validarCambioQuienVende, type GrupoResumen,
} from './configurador.quien-vende';
import { QuienVendeDto, QuienVendeQueryDto } from './dto/configurador-quien-vende.dto';

/**
 * Filas de mausuplan del plan con el nombre de la entidad: P → maproduc.xproductor, C → macanalalt.xcanalalt,
 * G → magestor.xgestor (citem = cgestor). Termina con WHERE abierto (se le agregan filtros).
 */
const SQL_FILAS = `
  SELECT u.id, RTRIM(u.centidad) AS centidad, RTRIM(u.citem) AS citem, RTRIM(u.itipouso) AS itipouso, RTRIM(u.xdescripcion) AS xdescripcion,
    CASE u.centidad WHEN 'P' THEN LTRIM(RTRIM(p.xproductor)) WHEN 'C' THEN LTRIM(RTRIM(c.xcanalalt)) WHEN 'G' THEN LTRIM(RTRIM(g.xgestor)) END AS nombre
  FROM mausuplan u WITH (NOLOCK)
  LEFT JOIN maproduc p WITH (NOLOCK) ON u.centidad = 'P' AND p.cproductor = TRY_CONVERT(NUMERIC(11, 0), u.citem)
  LEFT JOIN macanalalt c WITH (NOLOCK) ON u.centidad = 'C' AND c.ccanalalt = TRY_CONVERT(SMALLINT, u.citem)
  LEFT JOIN magestor g WITH (NOLOCK) ON u.centidad = 'G' AND g.cgestor = u.citem COLLATE DATABASE_DEFAULT
  WHERE u.cramo = @cramo AND u.cplan = @cplan`;

/** Validación de existencia de los items según la entidad (sobre @items JSON). Devuelve los que faltan. */
const SQL_ITEMS_FALTANTES: Record<'P' | 'C' | 'G', string> = {
  P: `SELECT j.value AS citem FROM OPENJSON(@items) j
      WHERE NOT EXISTS (SELECT 1 FROM maproduc p WITH (NOLOCK) WHERE p.cproductor = TRY_CONVERT(NUMERIC(11, 0), j.value))`,
  C: `SELECT j.value AS citem FROM OPENJSON(@items) j
      WHERE NOT EXISTS (SELECT 1 FROM macanalalt c WITH (NOLOCK) WHERE c.bactivo = 1 AND c.ccanalalt = TRY_CONVERT(SMALLINT, j.value))`,
  G: `SELECT j.value AS citem FROM OPENJSON(@items) j
      WHERE NOT EXISTS (SELECT 1 FROM magestor g WITH (NOLOCK) WHERE g.cgestor = CAST(j.value AS VARCHAR(50)) COLLATE DATABASE_DEFAULT)`,
};
const DONDE_FALTAN: Record<'P' | 'C' | 'G', string> = { P: 'maproduc', C: 'macanalalt (activos)', G: 'magestor' };

/** Items del cambio en una tabla variable @it (NULL = todos). Parámetros @todos y @items. */
const SQL_ITEMS = `DECLARE @it TABLE (citem VARCHAR(50) NULL);
IF @todos = 1 INSERT INTO @it (citem) VALUES (NULL);
ELSE INSERT INTO @it (citem) SELECT DISTINCT CAST(value AS VARCHAR(50)) FROM OPENJSON(@items);`;

const MISMA_FILA = `u.cramo = @cramo AND u.cplan = @cplan AND u.centidad = @centidad AND u.itipouso = @itipouso
  AND ((i.citem IS NULL AND u.citem IS NULL) OR u.citem = i.citem)`;

/**
 * Quién vende el plan (mausuplan): listado paginado con nombres, resumen, alta (id = MAX+1 con UPDLOCK/HOLDLOCK,
 * ignora duplicados exactos) y baja física (la tabla no tiene iestado; la respuesta trae las filas borradas).
 */
@Injectable()
export class ConfiguradorQuienVendeService {
  private readonly logger = new Logger(ConfiguradorQuienVendeService.name);

  constructor(private readonly db: MssqlService) {}

  async listar(cramo: number, cplan: string, q: QuienVendeQueryDto) {
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const { limit, offset } = paginado(q.limit, q.offset);
    const texto = String(q.q ?? '').trim().slice(0, 60);
    const req = this.planReq(cramo, cplan);
    req.input('centidad', sql.Char(1), q.centidad ?? null);
    req.input('itipouso', sql.Char(1), q.itipouso ?? null);
    req.input('q', sql.VarChar(60), texto);
    req.input('q2', sql.VarChar(62), `%${texto}%`);
    req.input('limit', sql.Int, limit);
    req.input('offset', sql.Int, offset);
    const filtro = `(@centidad IS NULL OR x.centidad = @centidad) AND (@itipouso IS NULL OR x.itipouso = @itipouso)
      AND (@q = '' OR x.citem LIKE @q2 OR x.nombre LIKE @q2)`;
    const r = await req.query(`
      SELECT COUNT(*) AS total FROM (${SQL_FILAS}) x WHERE ${filtro};
      SELECT * FROM (${SQL_FILAS}) x WHERE ${filtro}
      ORDER BY x.centidad, x.itipouso, CASE WHEN x.citem IS NULL THEN 0 ELSE 1 END, x.citem, x.id
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
    const [conteo, filas] = r.recordsets as unknown as Record<string, unknown>[][];
    return {
      total: Number(conteo?.[0]?.total ?? 0),
      limit,
      offset,
      filas: (filas ?? []).map((f) => ({
        id: Number(f.id),
        centidad: rtrim(f.centidad),
        entidad: NOMBRE_ENTIDAD[rtrim(f.centidad)] ?? 'no confirmado',
        citem: f.citem == null ? null : rtrim(f.citem),
        todos: f.citem == null,
        nombre: rtrim(f.nombre) || null,
        itipouso: rtrim(f.itipouso),
        xdescripcion: rtrim(f.xdescripcion) || null,
      })),
    };
  }

  async resumen(cramo: number, cplan: string) {
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const r = await this.planReq(cramo, cplan).query(`
      SELECT RTRIM(centidad) AS centidad, RTRIM(itipouso) AS itipouso, COUNT(*) AS filas,
             SUM(CASE WHEN citem IS NULL THEN 1 ELSE 0 END) AS todos
      FROM mausuplan WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan
      GROUP BY centidad, itipouso ORDER BY centidad, itipouso`);
    const grupos: GrupoResumen[] = ((r.recordset ?? []) as Record<string, unknown>[]).map((f) => ({
      centidad: rtrim(f.centidad), itipouso: rtrim(f.itipouso), filas: Number(f.filas), todos: Number(f.todos),
    }));
    return { cramo, cplan: cplan.trim(), ...armarResumen(grupos) };
  }

  /** Alta: una fila por item (o la fila «todos»); los duplicados exactos se ignoran (yaEstaban). */
  async alta(cramo: number, cplan: string, dto: QuienVendeDto) {
    exigirBandera(BANDERA_QUIEN_VENDE, 'quién vende');
    const errores = validarCambioQuienVende(dto, 'alta');
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const items = normalizarItems(dto.items);
    await this.exigirItems(dto.centidad, items);

    const req = this.cambioReq(cramo, cplan, dto, items);
    auditoriaSql(req);
    const r = await escribirSql(this.logger, 'agregar quién vende', () => req.query(lote([
      SQL_ITEMS,
      'DECLARE @id INT = (SELECT ISNULL(MAX(id), 0) FROM mausuplan WITH (UPDLOCK, HOLDLOCK));',
      'DECLARE @nuevos TABLE (id INT, citem VARCHAR(50) NULL);',
      `INSERT INTO mausuplan (id, centidad, citem, cramo, cplan, u_version, cprog, ifuente, fingreso, cusuario, ccategoria, itipouso)
       OUTPUT inserted.id, inserted.citem INTO @nuevos
       SELECT @id + ROW_NUMBER() OVER (ORDER BY i.citem), @centidad, i.citem, @cramo, @cplan, '!', @cprog, @ifuente, GETDATE(), @cusuario, 1, @itipouso
       FROM @it i WHERE NOT EXISTS (SELECT 1 FROM mausuplan u WHERE ${MISMA_FILA});`,
    ]) + `
SELECT id, citem FROM @nuevos ORDER BY id;
SELECT DISTINCT RTRIM(u.citem) AS citem FROM mausuplan u WITH (NOLOCK) INNER JOIN @it i
  ON ((i.citem IS NULL AND u.citem IS NULL) OR u.citem = i.citem)
WHERE u.cramo = @cramo AND u.cplan = @cplan AND u.centidad = @centidad AND u.itipouso <> @itipouso;`));
    const [nuevos, contrarios] = r.recordsets as unknown as Record<string, unknown>[][];
    const agregados = (nuevos ?? []).map((f) => ({ id: Number(f.id), citem: f.citem == null ? null : rtrim(f.citem) }));
    const nuevosSet = new Set(agregados.map((a) => a.citem));
    const pedidos = items ?? [null];
    this.logger.log(`mausuplan alta ${cramo}/${cplan.trim()} ${dto.centidad}/${dto.itipouso}: ${agregados.length} de ${pedidos.length}`);
    return {
      cramo, cplan: cplan.trim(), centidad: dto.centidad, itipouso: dto.itipouso,
      agregados,
      yaEstaban: pedidos.filter((p) => !nuevosSet.has(p)),
      advertencias: avisosContrarios(dto.centidad, dto.itipouso, (contrarios ?? []).map((f) => (f.citem == null ? null : rtrim(f.citem)))),
    };
  }

  /** Baja física de esas filas (items null = la fila «todos»). Devuelve las filas borradas completas (respaldo). */
  async baja(cramo: number, cplan: string, dto: QuienVendeDto) {
    exigirBandera(BANDERA_QUIEN_VENDE, 'quién vende');
    const errores = validarCambioQuienVende(dto, 'baja');
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const items = normalizarItems(dto.items);
    const req = this.cambioReq(cramo, cplan, dto, items);
    const r = await escribirSql(this.logger, 'quitar quién vende', () => req.query(lote([
      SQL_ITEMS,
      `DECLARE @b TABLE (id INT, centidad CHAR(1), citem VARCHAR(50) NULL, cramo INT, cplan NVARCHAR(25), u_version CHAR(1), xdescripcion CHAR(255),
        cprog CHAR(20), ifuente CHAR(10), fingreso DATETIME, cusuario NUMERIC(11), ccategoria SMALLINT, fultmod DATETIME, cusuariomod NUMERIC(11),
        ccategoriamod SMALLINT, itipouso CHAR(1));`,
      `DELETE u OUTPUT deleted.id, deleted.centidad, deleted.citem, deleted.cramo, deleted.cplan, deleted.u_version, deleted.xdescripcion,
         deleted.cprog, deleted.ifuente, deleted.fingreso, deleted.cusuario, deleted.ccategoria, deleted.fultmod, deleted.cusuariomod,
         deleted.ccategoriamod, deleted.itipouso INTO @b
       FROM mausuplan u INNER JOIN @it i ON ((i.citem IS NULL AND u.citem IS NULL) OR u.citem = i.citem)
       WHERE u.cramo = @cramo AND u.cplan = @cplan AND u.centidad = @centidad AND u.itipouso = @itipouso;`,
      'IF NOT EXISTS (SELECT 1 FROM @b)',
      throwSql(SQL_NO_EXISTE, 'Ninguno de los items indicados está en mausuplan del plan con esa entidad y tipo de uso.'),
    ]) + `
SELECT * FROM @b ORDER BY id;
SELECT COUNT(*) AS n FROM mausuplan WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND itipouso = 'A';`));
    const [borradasRaw, quedan] = r.recordsets as unknown as Record<string, unknown>[][];
    const borradas = (borradasRaw ?? []).map(filaPlana);
    const borradosSet = new Set(borradas.map((b) => (b.citem == null ? null : String(b.citem))));
    const advertencias: string[] = [];
    if (Number(quedan?.[0]?.n ?? 0) === 0) advertencias.push("El plan quedó sin ninguna fila 'A' en mausuplan: nadie lo puede vender.");
    this.logger.warn(`mausuplan baja ${cramo}/${cplan.trim()} ${dto.centidad}/${dto.itipouso}: ${JSON.stringify(borradas)}`);
    return {
      cramo, cplan: cplan.trim(), centidad: dto.centidad, itipouso: dto.itipouso,
      borradas,
      noEncontrados: (items ?? [null]).filter((i) => !borradosSet.has(i)),
      advertencias,
    };
  }

  private planReq(cramo: number, cplan: string) {
    const req = this.db.request();
    req.input('cramo', sql.Int, cramo);
    req.input('cplan', sql.NVarChar(25), cplan.trim());
    return req;
  }

  private cambioReq(cramo: number, cplan: string, dto: QuienVendeDto, items: string[] | null) {
    const req = this.planReq(cramo, cplan);
    req.input('centidad', sql.Char(1), dto.centidad);
    req.input('itipouso', sql.Char(1), dto.itipouso);
    req.input('todos', sql.Bit, items === null ? 1 : 0);
    req.input('items', sql.NVarChar(sql.MAX), JSON.stringify(items ?? []));
    return req;
  }

  /** 400 con los códigos que no existen en la tabla de la entidad (C: solo canales activos). */
  private async exigirItems(centidad: 'P' | 'C' | 'G', items: string[] | null) {
    if (items === null) return;
    const req = this.db.request();
    req.input('items', sql.NVarChar(sql.MAX), JSON.stringify(items));
    const r = await req.query(SQL_ITEMS_FALTANTES[centidad]);
    const faltan = ((r.recordset ?? []) as Record<string, unknown>[]).map((f) => rtrim(f.citem));
    if (faltan.length) {
      const muestra = faltan.slice(0, 20).join(', ') + (faltan.length > 20 ? ` y ${faltan.length - 20} más` : '');
      throw new BadRequestException(`${faltan.length} código(s) no existen en ${DONDE_FALTAN[centidad]}: ${muestra}.`);
    }
  }
}
