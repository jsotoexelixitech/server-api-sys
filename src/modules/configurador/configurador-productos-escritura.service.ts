import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { CPROG, CUSUARIO, errorSql, exigirBandera, existeSql, rtrim } from './configurador.comun';
import { BANDERA_PRODUCTOS } from './configurador-fase2.comun';
import { COLUMNAS_PRODUCTO, filaProducto, type ProductoSis2000 } from './configurador.productos';
import {
  CAMPOS_POST_ALTA, CAMPOS_PRODUCTO, avisosCodigoProducto, camposEnviados, validarCamposProducto, validarEdicionProducto,
  type CampoProducto, type ValorProducto,
} from './configurador.productos-escritura';
import { CrearProductoCompletoDto, EditarProductoDto } from './dto/configurador-productos-escritura.dto';

/** Tipo mssql de cada campo editable (igual que en maproductos). */
function tipoCampo(c: CampoProducto) {
  const def = CAMPOS_PRODUCTO[c] as { tipo: string; max?: number };
  if (def.tipo === 'bit') return sql.Bit;
  if (def.tipo === 'entero') return sql.Int;
  return c === 'xdescripcion_l' || c === 'xdescripcion_c' || c === 'xabreviatura' ? sql.Char(def.max ?? 60) : sql.VarChar(def.max ?? 200);
}

/** Escritura de productos (maproductos): alta con sp_CrearProducto + UPDATE en una transacción, y edición por cramo. */
@Injectable()
export class ConfiguradorProductosEscrituraService {
  private readonly logger = new Logger(ConfiguradorProductosEscrituraService.name);

  constructor(private readonly db: MssqlService) {}

  /**
   * Alta: sp_CrearProducto (mismos parámetros que antes, compatible con cualquier versión del SP) y, en la misma
   * transacción, UPDATE de igestor, xform, campos comerciales y cprog = NEXUS-CONFIG. 409 si el código ya existe
   * (en cualquier ramo: sp_CrearProducto lo rechaza igual). Aviso si el código tiene más de 6 caracteres.
   */
  async crear(dto: CrearProductoCompletoDto) {
    exigirBandera(BANDERA_PRODUCTOS, 'productos');
    const errores = validarCamposProducto(dto as unknown as Partial<Record<CampoProducto, unknown>>, CAMPOS_POST_ALTA);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const cproducto = dto.cproducto.trim();
    const nombre = dto.xdescripcion_l.trim();
    const rr = this.db.request();
    rr.input('cramo', sql.SmallInt, dto.cramo);
    if (!(await existeSql(rr, 'SELECT 1 FROM maramos WITH (NOLOCK) WHERE cramo = @cramo'))) throw new BadRequestException(`No existe el ramo ${dto.cramo}.`);

    const tx = this.db.transaction();
    await tx.begin();
    try {
      const pre = new sql.Request(tx);
      pre.input('cproducto', sql.Char(40), cproducto);
      const ya = await pre.query(`SELECT COUNT(*) AS n FROM maproductos WITH (UPDLOCK, HOLDLOCK) WHERE RTRIM(cproducto) = RTRIM(@cproducto)`);
      if (Number(ya.recordset?.[0]?.n ?? 0) > 0) throw new ConflictException(`El código de producto ${cproducto} ya existe en maproductos.`);

      const req = new sql.Request(tx);
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
      const r = await req.execute('sp_CrearProducto');
      const fila = (r.recordset?.[0] ?? {}) as Record<string, unknown>;
      const mensaje = rtrim(fila.message ?? fila.mensaje);
      if (!(fila.status === true || Number(fila.status) === 1)) {
        this.logger.error(`sp_CrearProducto ${cproducto} ramo ${dto.cramo}: ${JSON.stringify(fila)}`);
        throw new BadRequestException(mensaje || 'sp_CrearProducto rechazó el producto.');
      }

      const pares = camposEnviados(dto as unknown as Partial<Record<CampoProducto, unknown>>, CAMPOS_POST_ALTA);
      const up = new sql.Request(tx);
      up.input('cproducto', sql.Char(40), cproducto);
      up.input('cramo', sql.Numeric(5, 0), dto.cramo);
      up.input('cprog', sql.Char(20), CPROG);
      const sets = ['cprog = @cprog', "u_version = ISNULL(u_version, '!')", 'ccategoria = ISNULL(ccategoria, 1)'];
      for (const [c, v] of pares) { sets.push(`${c} = @${c}`); up.input(c, tipoCampo(c), v); }
      await up.query(`UPDATE maproductos SET ${sets.join(', ')} WHERE cproducto = @cproducto AND cramo = @cramo`);
      await tx.commit();
      this.logger.log(`sp_CrearProducto ${cproducto} ramo ${dto.cramo}: creado (+ ${pares.map(([c]) => c).join(', ') || 'solo cprog'})`);
    } catch (err) {
      await tx.rollback().catch(() => undefined);
      throw errorSql(this.logger, 'crear el producto', err);
    }
    return {
      cproducto, cramo: dto.cramo, message: 'Producto creado.',
      producto: await this.leer(cproducto, dto.cramo),
      advertencias: avisosCodigoProducto(cproducto),
    };
  }

  /**
   * Edita los campos enviados del producto con ese código y ese ramo (cproducto y cramo no cambian). 404 si no
   * existe en el ramo; 409 si hay más de una fila con el mismo código en el mismo ramo. Devuelve antes y después.
   */
  async editar(cproducto: string, dto: EditarProductoDto) {
    exigirBandera(BANDERA_PRODUCTOS, 'productos');
    const errores = validarEdicionProducto(dto as unknown as Partial<Record<CampoProducto, unknown>> & { cramo?: unknown });
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const codigo = String(cproducto ?? '').trim();
    const antes = await this.leer(codigo, dto.cramo);
    const pares = camposEnviados(dto as unknown as Partial<Record<CampoProducto, unknown>>);
    const req = this.db.request();
    req.input('cproducto', sql.Char(40), codigo);
    req.input('cramo', sql.Numeric(5, 0), dto.cramo);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const sets = pares.map(([c, v]: [CampoProducto, ValorProducto]) => { req.input(c, tipoCampo(c), v); return `${c} = @${c}`; });
    try {
      const r = await req.query(`
        SET XACT_ABORT ON;
        BEGIN TRAN;
        DECLARE @n INT = (SELECT COUNT(*) FROM maproductos WITH (UPDLOCK, HOLDLOCK) WHERE cproducto = @cproducto AND cramo = @cramo);
        IF @n = 1
          UPDATE maproductos SET ${sets.join(', ')}, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1
          WHERE cproducto = @cproducto AND cramo = @cramo;
        COMMIT TRAN;
        SELECT @n AS n;`);
      const n = Number(r.recordset?.[0]?.n ?? 0);
      if (n === 0) throw new NotFoundException(`No existe el producto ${codigo} en el ramo ${dto.cramo}.`);
      if (n > 1) throw new ConflictException(`Hay ${n} productos ${codigo} en el ramo ${dto.cramo}: corrígelo en Sis2000.`);
    } catch (err) {
      throw errorSql(this.logger, 'editar el producto', err);
    }
    this.logger.log(`maproductos ${codigo}/${dto.cramo}: ${pares.map(([c]) => c).join(', ')}`);
    return { cproducto: codigo, cramo: dto.cramo, antes, despues: await this.leer(codigo, dto.cramo), advertencias: avisosCodigoProducto(codigo) };
  }

  /** El producto con ese código y ese ramo (404 si no existe en el ramo). */
  private async leer(cproducto: string, cramo: number): Promise<ProductoSis2000> {
    const req = this.db.request();
    req.input('cproducto', sql.Char(40), cproducto);
    req.input('cramo', sql.Numeric(5, 0), cramo);
    const r = await req.query(`SELECT TOP (1) ${COLUMNAS_PRODUCTO.join(', ')} FROM maproductos WITH (NOLOCK)
      WHERE cproducto = @cproducto AND cramo = @cramo`);
    const f = r.recordset?.[0] as Record<string, unknown> | undefined;
    if (!f) throw new NotFoundException(`No existe el producto ${cproducto} en el ramo ${cramo}.`);
    return filaProducto(f);
  }
}
