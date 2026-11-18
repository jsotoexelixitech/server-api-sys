import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import {
  CUSUARIO, SQL_CONFLICTO, SQL_NO_EXISTE, auditoriaSql, escribirSql, exigirBandera, exigirPlanSql, existeSql, lote, rtrim, throwSql,
} from './configurador.comun';
import { BANDERA_FRECUENCIAS, filaPlana } from './configurador-fase2.comun';
import {
  descripcionAlta, elegirFilaFrecuencia, ndiasLlave, normalizarLetra, validarAltaFrecuencia, validarAltaFrecuenciaProductor,
  validarEdicionFrecuencia, type FilaFrecuencia,
} from './configurador.frecuencias';
import { EditarFrecuenciaPlanDto, FrecuenciaPlanDto, FrecuenciaProductorDto } from './dto/configurador-frecuencias.dto';

export interface FrecuenciaLeida {
  ifrecuencia: string;
  xfrecuencia: string;
  ndias: number | null;
  iestado: string;
  itipo: string | null;
  ctipo: number | null;
  bnacional: boolean | null;
  xplan: string | null;
  cprog: string | null;
}

/**
 * Frecuencias de pago del plan (maplanes_frec, sin PK: llave lógica cramo+cplan+ifrecuencia+ISNULL(ndias,0)) y
 * frecuencias propias de un productor (maplanes_frec_produc, sin iestado ni auditoría: la única que se borra).
 */
@Injectable()
export class ConfiguradorFrecuenciasService {
  private readonly logger = new Logger(ConfiguradorFrecuenciasService.name);

  constructor(private readonly db: MssqlService) {}

  /** Todas las filas del plan (V, I y las N/A que haya en Sis2000, para que el builder las vea). */
  async listar(cramo: number, cplan: string): Promise<FrecuenciaLeida[]> {
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`
      SELECT RTRIM(ifrecuencia) AS ifrecuencia, RTRIM(xfrecuencia) AS xfrecuencia, ndias, RTRIM(iestado) AS iestado, RTRIM(itipo) AS itipo,
             ctipo, bnacional, RTRIM(xplan) AS xplan, RTRIM(cprog) AS cprog
      FROM maplanes_frec WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan
      ORDER BY CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, ifrecuencia, ndias`);
    return ((r.recordset ?? []) as Record<string, unknown>[]).map((f) => ({
      ifrecuencia: rtrim(f.ifrecuencia),
      xfrecuencia: rtrim(f.xfrecuencia),
      ndias: f.ndias == null ? null : Number(f.ndias),
      iestado: rtrim(f.iestado),
      itipo: rtrim(f.itipo) || null,
      ctipo: f.ctipo == null ? null : Number(f.ctipo),
      bnacional: f.bnacional == null ? null : f.bnacional === true || Number(f.bnacional) === 1,
      xplan: rtrim(f.xplan) || null,
      cprog: rtrim(f.cprog) || null,
    }));
  }

  /**
   * Alta. 409 si ya hay una fila 'V' con la misma llave. Si la llave existe en 'I' se reactiva esa fila (no se duplica).
   * xplan, ctipo y bnacional se copian de la cabecera del plan, como hace spMantPlanes.
   */
  async crear(cramo: number, cplan: string, dto: FrecuenciaPlanDto) {
    exigirBandera(BANDERA_FRECUENCIAS, 'frecuencias');
    const errores = validarAltaFrecuencia(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const letra = normalizarLetra(dto.ifrecuencia);
    const xfrecuencia = descripcionAlta(dto);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    req.input('ifrec', sql.Char(6), letra);
    req.input('ndias', sql.Numeric(18, 0), dto.ndias ?? null);
    req.input('ndiasK', sql.Numeric(18, 0), ndiasLlave(dto.ndias));
    req.input('xfrec', sql.Char(150), xfrecuencia);
    req.input('itipo', sql.Char(1), dto.itipo?.trim() || null);
    auditoriaSql(req);
    const k = 'cramo = @cramo AND cplan = @cplan AND ifrecuencia = @ifrec AND ISNULL(ndias, 0) = @ndiasK';
    const r = await escribirSql(this.logger, 'agregar la frecuencia', () => req.query(lote([
      "DECLARE @xplan CHAR(60), @ctipo NUMERIC(2), @bnac BIT, @hay BIT = 0, @accion VARCHAR(12) = 'creada';",
      `SELECT TOP 1 @xplan = xplan, @ctipo = ctipo, @bnac = bnacional, @hay = 1 FROM maplanes WHERE cramo = @cramo AND cplan = @cplan
        ORDER BY CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, fdesde_plan DESC;`,
      `IF @hay = 0 SELECT TOP 1 @xplan = xplan, @hay = 1 FROM maplanes_per WHERE cramo = @cramo AND cplan = @cplan
        ORDER BY CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, fdesde_plan DESC;`,
      'IF @hay = 0',
      throwSql(SQL_NO_EXISTE, `No existe el plan ${cplan.trim()} en el ramo ${cramo}.`),
      `IF EXISTS (SELECT 1 FROM maplanes_frec WITH (UPDLOCK, HOLDLOCK) WHERE ${k} AND iestado = 'V')`,
      throwSql(SQL_CONFLICTO, `El plan ya tiene la frecuencia ${letra} con ndias ${ndiasLlave(dto.ndias)} vigente ('V').`),
      `IF EXISTS (SELECT 1 FROM maplanes_frec WHERE ${k} AND iestado = 'I')
      BEGIN
        ;WITH t AS (SELECT TOP (1) * FROM maplanes_frec WHERE ${k} AND iestado = 'I' ORDER BY fingreso DESC)
        UPDATE t SET iestado = 'V', xfrecuencia = @xfrec, itipo = ISNULL(@itipo, itipo), fultmod = GETDATE(), cusuariomod = @cusuario,
          ccategoriamod = 1;
        SET @accion = 'reactivada';
      END
      ELSE
        INSERT INTO maplanes_frec (cramo, cplan, ifrecuencia, u_version, xfrecuencia, xplan, ctipo, bnacional, ndias, iestado, cprog,
          ifuente, fingreso, cusuario, ccategoria, itipo)
        VALUES (@cramo, @cplan, @ifrec, '!', @xfrec, @xplan, @ctipo, @bnac, @ndias, 'V', @cprog, @ifuente, GETDATE(), @cusuario, 1, @itipo);`,
    ]) + '\nSELECT @accion AS accion;'));
    const accion = rtrim(r.recordset?.[0]?.accion) || 'creada';
    this.logger.log(`maplanes_frec ${accion} ${cramo}/${cplan.trim()} ${letra} ndias=${dto.ndias ?? 'NULL'}`);
    return { cramo, cplan: cplan.trim(), ifrecuencia: letra, xfrecuencia, ndias: dto.ndias ?? null, iestado: 'V', accion };
  }

  /**
   * Edita xfrecuencia, ndias (ndiasNuevo) o iestado de la fila de la letra (y ndias, si hay varias). 409 si quedarían
   * dos 'V' con la misma llave. Devuelve la fila antes y después.
   */
  async editar(cramo: number, cplan: string, ifrecuencia: string, dto: EditarFrecuenciaPlanDto) {
    exigirBandera(BANDERA_FRECUENCIAS, 'frecuencias');
    const letra = normalizarLetra(ifrecuencia);
    const errores = validarEdicionFrecuencia(dto, letra);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const filas: FilaFrecuencia[] = await this.listar(cramo, cplan);
    const eleccion = elegirFilaFrecuencia(filas, letra, dto.ndias === null ? 0 : dto.ndias);
    if ('error' in eleccion) throw eleccion.conflicto ? new ConflictException(eleccion.error) : new NotFoundException(eleccion.error);

    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    req.input('ifrec', sql.Char(6), letra);
    req.input('ndiasK', sql.Numeric(18, 0), eleccion.ndias);
    req.input('cx', sql.Bit, dto.xfrecuencia !== undefined ? 1 : 0);
    req.input('xfrec', sql.Char(150), dto.xfrecuencia?.trim() ?? null);
    req.input('cn', sql.Bit, dto.ndiasNuevo !== undefined ? 1 : 0);
    req.input('ndiasNuevo', sql.Numeric(18, 0), dto.ndiasNuevo ?? null);
    req.input('iestado', sql.Char(1), dto.iestado ?? null);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const k = 'cramo = @cramo AND cplan = @cplan AND ifrecuencia = @ifrec';
    const objetivo = `SELECT TOP (1) * FROM maplanes_frec WITH (UPDLOCK, HOLDLOCK) WHERE ${k} AND ISNULL(ndias, 0) = @ndiasK AND iestado IN ('V', 'I')
      ORDER BY CASE WHEN iestado = 'V' THEN 0 ELSE 1 END, fingreso DESC`;
    const r = await escribirSql(this.logger, 'editar la frecuencia', () => req.query(lote([
      `DECLARE @r TABLE (x_antes VARCHAR(150), n_antes NUMERIC(18), e_antes CHAR(1), x_despues VARCHAR(150), n_despues NUMERIC(18), e_despues CHAR(1));`,
      `DECLARE @est CHAR(1), @nd NUMERIC(18);`,
      `SELECT @est = iestado, @nd = ndias FROM (${objetivo}) t;`,
      'IF @est IS NULL',
      throwSql(SQL_NO_EXISTE, `El plan no tiene la frecuencia ${letra} con ndias ${eleccion.ndias} en 'V' o 'I'.`),
      `IF (SELECT COUNT(*) FROM maplanes_frec WHERE ${k} AND ISNULL(ndias, 0) = @ndiasK AND iestado = 'V') > 1`,
      throwSql(SQL_CONFLICTO, `Hay más de una fila 'V' de la frecuencia ${letra} con ndias ${eleccion.ndias}: corrígelo en Sis2000.`),
      'DECLARE @estFinal CHAR(1) = ISNULL(@iestado, @est);',
      'DECLARE @ndFinal NUMERIC(18) = CASE WHEN @cn = 1 THEN @ndiasNuevo ELSE @nd END;',
      `IF @estFinal = 'V' AND NOT (@est = 'V' AND ISNULL(@ndFinal, 0) = @ndiasK)
         AND EXISTS (SELECT 1 FROM maplanes_frec WHERE ${k} AND ISNULL(ndias, 0) = ISNULL(@ndFinal, 0) AND iestado = 'V')`,
      throwSql(SQL_CONFLICTO, `Ya hay una frecuencia ${letra} 'V' con ese ndias: quedarían dos filas vigentes con la misma llave.`),
      `;WITH t AS (${objetivo})
       UPDATE t SET xfrecuencia = CASE WHEN @cx = 1 THEN @xfrec ELSE xfrecuencia END, ndias = @ndFinal, iestado = @estFinal,
         fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
       OUTPUT RTRIM(deleted.xfrecuencia), deleted.ndias, deleted.iestado, RTRIM(inserted.xfrecuencia), inserted.ndias, inserted.iestado INTO @r;`,
    ]) + '\nSELECT * FROM @r;'));
    const f = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (v == null ? null : Number(v));
    this.logger.log(`maplanes_frec editada ${cramo}/${cplan.trim()} ${letra} ndias=${eleccion.ndias}: ${JSON.stringify(f)}`);
    return {
      cramo, cplan: cplan.trim(), ifrecuencia: letra,
      antes: { xfrecuencia: rtrim(f.x_antes), ndias: num(f.n_antes), iestado: rtrim(f.e_antes) },
      despues: { xfrecuencia: rtrim(f.x_despues), ndias: num(f.n_despues), iestado: rtrim(f.e_despues) },
    };
  }

  // ── Frecuencias propias de un productor (maplanes_frec_produc) ─────────────

  async listarProductor(cramo: number, cplan: string) {
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`
      SELECT f.cproductor, LTRIM(RTRIM(p.xproductor)) AS xproductor, RTRIM(f.ifrecuencia) AS ifrecuencia, f.ndias,
             RTRIM(f.xfrecuencia) AS xfrecuencia, RTRIM(f.itipo) AS itipo
      FROM maplanes_frec_produc f WITH (NOLOCK)
      LEFT JOIN maproduc p WITH (NOLOCK) ON p.cproductor = f.cproductor
      WHERE f.cramo = @cramo AND f.cplan = @cplan
      ORDER BY f.cproductor, f.ifrecuencia, f.ndias`);
    return ((r.recordset ?? []) as Record<string, unknown>[]).map((f) => ({
      cproductor: f.cproductor == null ? null : Number(f.cproductor),
      xproductor: rtrim(f.xproductor) || null,
      ifrecuencia: rtrim(f.ifrecuencia),
      ndias: f.ndias == null ? null : Number(f.ndias),
      xfrecuencia: rtrim(f.xfrecuencia),
      itipo: rtrim(f.itipo) || null,
    }));
  }

  /** Alta (tabla sin auditoría ni iestado). 409 si el productor ya tiene esa letra y ndias en el plan. */
  async crearProductor(cramo: number, cplan: string, dto: FrecuenciaProductorDto) {
    exigirBandera(BANDERA_FRECUENCIAS, 'frecuencias');
    const errores = validarAltaFrecuenciaProductor(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const rp = this.db.request();
    rp.input('cproductor', sql.Numeric(11, 0), dto.cproductor);
    if (!(await existeSql(rp, 'SELECT 1 FROM maproduc WITH (NOLOCK) WHERE cproductor = @cproductor'))) {
      throw new BadRequestException(`El productor ${dto.cproductor} no existe en maproduc.`);
    }
    const letra = normalizarLetra(dto.ifrecuencia);
    const xfrecuencia = descripcionAlta(dto);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    req.input('cproductor', sql.Numeric(10, 0), dto.cproductor);
    req.input('ifrec', sql.Char(6), letra);
    req.input('ndias', sql.Numeric(18, 0), dto.ndias ?? null);
    req.input('ndiasK', sql.Numeric(18, 0), ndiasLlave(dto.ndias));
    req.input('xfrec', sql.Char(150), xfrecuencia);
    req.input('itipo', sql.Char(1), dto.itipo?.trim() || null);
    await escribirSql(this.logger, 'agregar la frecuencia del productor', () => req.query(lote([
      `IF EXISTS (SELECT 1 FROM maplanes_frec_produc WITH (UPDLOCK, HOLDLOCK) WHERE cramo = @cramo AND cplan = @cplan
         AND cproductor = @cproductor AND ifrecuencia = @ifrec AND ISNULL(ndias, 0) = @ndiasK)`,
      throwSql(SQL_CONFLICTO, `El productor ${dto.cproductor} ya tiene la frecuencia ${letra} con ndias ${ndiasLlave(dto.ndias)} en este plan.`),
      `INSERT INTO maplanes_frec_produc (cramo, cplan, cproductor, ifrecuencia, ndias, xfrecuencia, itipo)
       VALUES (@cramo, @cplan, @cproductor, @ifrec, @ndias, @xfrec, @itipo);`,
    ])));
    const advertencias: string[] = [];
    const rv = this.db.request();
    rv.input('cramo', sql.SmallInt, cramo);
    rv.input('cplan', sql.Char(6), cplan.trim());
    rv.input('ifrec', sql.Char(6), letra);
    if (!(await existeSql(rv, "SELECT 1 FROM maplanes_frec WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND ifrecuencia = @ifrec AND iestado = 'V'"))) {
      advertencias.push(`El plan no tiene la frecuencia ${letra} vigente en maplanes_frec.`);
    }
    this.logger.log(`maplanes_frec_produc alta ${cramo}/${cplan.trim()} productor ${dto.cproductor} ${letra}`);
    return { cramo, cplan: cplan.trim(), cproductor: dto.cproductor, ifrecuencia: letra, ndias: dto.ndias ?? null, xfrecuencia, advertencias };
  }

  /** Baja física (la tabla no tiene iestado). Devuelve las filas borradas para el respaldo. 404 si no hay ninguna. */
  async borrarProductor(cramo: number, cplan: string, cproductor: number, ifrecuencia: string, ndias?: number) {
    exigirBandera(BANDERA_FRECUENCIAS, 'frecuencias');
    const letra = normalizarLetra(ifrecuencia);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    req.input('cproductor', sql.Numeric(10, 0), cproductor);
    req.input('ifrec', sql.Char(6), letra);
    req.input('ndiasK', sql.Numeric(18, 0), ndias ?? null);
    const r = await escribirSql(this.logger, 'borrar la frecuencia del productor', () => req.query(lote([
      'DECLARE @b TABLE (cramo SMALLINT, cplan CHAR(6), cproductor NUMERIC(10), ifrecuencia CHAR(6), ndias NUMERIC(18), xfrecuencia CHAR(150), itipo CHAR(1));',
      `DELETE FROM maplanes_frec_produc
       OUTPUT deleted.cramo, deleted.cplan, deleted.cproductor, deleted.ifrecuencia, deleted.ndias, deleted.xfrecuencia, deleted.itipo INTO @b
       WHERE cramo = @cramo AND cplan = @cplan AND cproductor = @cproductor AND ifrecuencia = @ifrec
         AND (@ndiasK IS NULL OR ISNULL(ndias, 0) = @ndiasK);`,
      'IF NOT EXISTS (SELECT 1 FROM @b)',
      throwSql(SQL_NO_EXISTE, `El productor ${cproductor} no tiene la frecuencia ${letra} en el plan ${cplan.trim()}.`),
    ]) + '\nSELECT * FROM @b;'));
    const borradas = ((r.recordset ?? []) as Record<string, unknown>[]).map(filaPlana);
    this.logger.warn(`maplanes_frec_produc baja ${cramo}/${cplan.trim()} productor ${cproductor} ${letra}: ${JSON.stringify(borradas)}`);
    return { cramo, cplan: cplan.trim(), cproductor, ifrecuencia: letra, borradas };
  }
}
