import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { ConfigurarProductosDto } from './dto/configurar-productos.dto';

/** Entidad de mausuplan para productores (citem = cproductor). */
const ENTIDAD_PRODUCTOR = 'P';

export interface PlanProducto {
  cplan: string;
  cramo: number;
  xplan: string;
  xramo: string | null;
  /** Plan que todo productor tiene sin configurar (mausuplan citem NULL, itipouso A) */
  porDefecto: boolean;
  /** Plan disponible para el intermediario: (por defecto o incluido) y no excluido */
  asignado: boolean;
}

export interface ProductoPlanes {
  cproducto: string;
  xproducto: string;
  planes: PlanProducto[];
}

interface FilaCatalogo {
  cproducto: string;
  xproducto: string;
  cplan: string;
  cramo: number;
  xplan: string;
  xramo: string | null;
  porDefecto: number;
  incluido: number;
  excluido: number;
}

/**
 * Productos de personas para productores (maproductos.iproductor = 1) con sus planes vigentes,
 * como products/planes de SysIP: maplanes_per y maplanes por cproducto; el 24 (auto) suma los planes del ramo 18.
 */
const CATALOGO_SQL = `
WITH planes AS (
  SELECT TRIM(p.cproducto) AS cproducto, TRIM(p.cplan) AS cplan, p.cramo, TRIM(p.xplan) AS xplan
    FROM maplanes_per p WITH (NOLOCK) WHERE p.iestado = 'V' AND p.cproducto IS NOT NULL
  UNION
  SELECT TRIM(p.cproducto), TRIM(p.cplan), p.cramo, TRIM(p.xplan)
    FROM maplanes p WITH (NOLOCK) WHERE p.iestado = 'V' AND p.cproducto IS NOT NULL
  UNION
  SELECT '24', TRIM(p.cplan), p.cramo, TRIM(p.xplan)
    FROM maplanes p WITH (NOLOCK) WHERE p.iestado = 'V' AND p.cramo = 18
)
SELECT pr.cproducto, pr.xproducto, pl.cplan, pl.cramo, pl.xplan, TRIM(r.xdescripcion_l) AS xramo,
       CASE WHEN EXISTS (SELECT 1 FROM mausuplan u WITH (NOLOCK)
                          WHERE u.centidad = @centidad AND u.citem IS NULL AND u.itipouso = 'A'
                            AND TRIM(u.cplan) = pl.cplan AND u.cramo = pl.cramo) THEN 1 ELSE 0 END AS porDefecto,
       CASE WHEN @citem IS NOT NULL AND EXISTS (SELECT 1 FROM mausuplan u WITH (NOLOCK)
                          WHERE u.centidad = @centidad AND u.citem = @citem AND u.itipouso = 'A'
                            AND TRIM(u.cplan) = pl.cplan AND u.cramo = pl.cramo) THEN 1 ELSE 0 END AS incluido,
       CASE WHEN @citem IS NOT NULL AND EXISTS (SELECT 1 FROM mausuplan u WITH (NOLOCK)
                          WHERE u.centidad = @centidad AND u.citem = @citem AND u.itipouso = 'E'
                            AND TRIM(u.cplan) = pl.cplan AND u.cramo = pl.cramo) THEN 1 ELSE 0 END AS excluido
  FROM (SELECT TRIM(cproducto) AS cproducto, TRIM(xdescripcion_l) AS xproducto
          FROM maproductos WITH (NOLOCK) WHERE iproductor = 1) pr
  JOIN planes pl ON pl.cproducto = pr.cproducto
  LEFT JOIN maramos r WITH (NOLOCK) ON r.cramo = pl.cramo
 ORDER BY pr.xproducto, r.xdescripcion_l, pl.xplan`;

/**
 * Productos y planes de un intermediario en Sis2000 (mausuplan), migrado de SysIP-backend sin tocarlo:
 *   - catálogo / asignación actual: misma lógica de products/planes y valrep/planes/producto
 *   - guardar: products/configureProducts -> spConfigurePlansProduct por producto y luego spConfigureProducts
 */
@Injectable()
export class IntermediariosProductosService {
  private readonly logger = new Logger(IntermediariosProductosService.name);

  constructor(private readonly mssql: MssqlService) {}

  /** Catálogo de productos con sus planes; con cproductor marca los que tiene asignados. */
  async catalogo(cproductor?: number): Promise<ProductoPlanes[]> {
    const sql = this.mssql.types;
    if (cproductor) await this.asegurarProductor(cproductor);
    const res = await this.mssql
      .request()
      .input('centidad', sql.Char(1), ENTIDAD_PRODUCTOR)
      .input('citem', sql.VarChar(20), cproductor ? String(cproductor) : null)
      .query<FilaCatalogo>(CATALOGO_SQL);

    const productos = new Map<string, ProductoPlanes>();
    for (const f of res.recordset) {
      let producto = productos.get(f.cproducto);
      if (!producto) {
        producto = { cproducto: f.cproducto, xproducto: f.xproducto, planes: [] };
        productos.set(f.cproducto, producto);
      }
      const porDefecto = !!f.porDefecto;
      producto.planes.push({
        cplan: f.cplan,
        cramo: Number(f.cramo),
        xplan: f.xplan,
        xramo: f.xramo,
        porDefecto,
        asignado: cproductor ? (porDefecto || !!f.incluido) && !f.excluido : porDefecto,
      });
    }
    return [...productos.values()];
  }

  /**
   * Guarda los productos y planes del intermediario con los SPs de La Mundial, en el mismo orden que
   * products/configureProducts de SysIP, dentro de una transacción.
   */
  async configurar(cproductor: number, dto: ConfigurarProductosDto): Promise<{ productos: number; planes: number }> {
    await this.asegurarProductor(cproductor);

    // Solo productos y planes del catálogo para productores
    const catalogo = await this.catalogo();
    const valido = new Map(catalogo.map((p) => [p.cproducto, new Set(p.planes.map((pl) => `${pl.cplan}|${pl.cramo}`))]));
    for (const producto of dto.productos) {
      const planes = valido.get(producto.cproducto);
      if (!planes) throw new BadRequestException(`El producto ${producto.cproducto} no está disponible para productores.`);
      if (!producto.planes.length) throw new BadRequestException(`Elige al menos un plan del producto ${producto.cproducto}.`);
      const ajeno = producto.planes.find((pl) => !planes.has(`${pl.cplan}|${pl.cramo}`));
      if (ajeno) {
        throw new BadRequestException(`El plan ${ajeno.cplan} (ramo ${ajeno.cramo}) no pertenece al producto ${producto.cproducto}.`);
      }
    }

    const sql = this.mssql.types;
    const citem = String(cproductor);
    const tx = this.mssql.transaction();
    await tx.begin();
    const req = () => new sql.Request(tx);

    try {
      for (const producto of dto.productos) {
        await req()
          .input('cproducto', sql.NVarChar(10), producto.cproducto)
          .input('planes', sql.NVarChar(sql.MAX), JSON.stringify(producto.planes.map((pl) => ({ cplan: pl.cplan, cramo: pl.cramo }))))
          .input('centidad', sql.Char(1), ENTIDAD_PRODUCTOR)
          .input('citem', sql.NVarChar(10), citem)
          .execute('spConfigurePlansProduct');
      }

      // Mismo formato que SysIP: 'cod1','cod2' ('' = ningún producto)
      const lista = `'${dto.productos.map((p) => p.cproducto).join("','")}'`;
      await req()
        .input('productos', sql.NVarChar(sql.MAX), lista)
        .input('centidad', sql.Char(1), ENTIDAD_PRODUCTOR)
        .input('citem', sql.NVarChar(10), citem)
        .execute('spConfigureProducts');

      await tx.commit();
      const planes = dto.productos.reduce((t, p) => t + p.planes.length, 0);
      this.logger.log(`Productos configurados cproductor=${cproductor} productos=${dto.productos.length} planes=${planes}`);
      return { productos: dto.productos.length, planes };
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        /* SQL Server ya abortó la transacción */
      }
      const mensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo configurar productos (cproductor=${cproductor}): ${mensaje}`);
      throw new InternalServerErrorException(`No fue posible guardar los productos: ${mensaje}`);
    }
  }

  private async asegurarProductor(cproductor: number): Promise<void> {
    const sql = this.mssql.types;
    const res = await this.mssql
      .request()
      .input('cproductor', sql.Numeric(11, 0), cproductor)
      .query('SELECT COUNT(*) AS existe FROM maproduc WHERE cproductor = @cproductor');
    if (!res.recordset[0].existe) throw new NotFoundException(`No existe el intermediario ${cproductor}.`);
  }
}
