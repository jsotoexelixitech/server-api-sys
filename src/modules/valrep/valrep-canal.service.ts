import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { GetProductosCanalDto } from './dto/get-productos-canal.dto';
import { GetPlanesProductoDto } from './dto/get-planes-producto.dto';
import { GetPlanDetalleDto } from './dto/get-plan-detalle.dto';
import { GetPlanPorDiasDto } from './dto/get-plan-por-dias.dto';

export interface PlanCanalItem {
  [key: string]: unknown;
  cplan?: string;
  xplan?: string;
  cramo?: number;
  parentescos?: Array<Record<string, unknown>>;
  coberturas?: Array<Record<string, unknown>>;
}

/**
 * Catálogo canal alternativo (vida, viajero, etc.) vía SPs Sis2000.
 * Aislado del flujo RCV (spBuscaPlan / spCalculoAuto) para no afectar emisión auto.
 */
@Injectable()
export class ValrepCanalService {
  private readonly logger = new Logger(ValrepCanalService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  /** centidad/citem opcionales — defaults desde env para pruebas QA sin apikey. */
  private resolveCanalContext(body: { centidad?: string; citem?: string }) {
    const centidad =
      body.centidad?.trim() ||
      this.config.get<string>('CANAL_DEFAULT_CENTIDAD')?.trim() ||
      null;
    const citem =
      body.citem?.trim() ||
      this.config.get<string>('CANAL_DEFAULT_CITEM')?.trim() ||
      null;
    return { centidad, citem };
  }

  /**
   * Paso 1 — productos habilitados para la entidad/canal.
   * Réplica de POST /api/v1/valrep/productos (spBuscaProductosEntidad).
   */
  async getProductos(body: GetProductosCanalDto = {}) {
    const { centidad, citem } = this.resolveCanalContext(body);
    const T = this.db.types;

    try {
      const req = this.db.request();
      req.input('citem', T.NVarChar(20), citem);
      req.input('centidad', T.Char(1), centidad);
      req.output('berror', T.Bit, false);
      req.output('mensaje', T.NVarChar(60), '');

      const result = await req.execute('spBuscaProductosEntidad');
      let rows = (result.recordset ?? []) as Record<string, unknown>[];

      if (rows.length === 0 && this.config.get<string>('CANAL_PRODUCTOS_QA_FALLBACK') === 'true') {
        this.logger.warn('getProductos: SP vacío — fallback QA maproductos activo');
        const fb = await this.db.request().query<Record<string, unknown>>(`
          SELECT TRIM(cproducto) AS cproducto, TRIM(xdescripcion_l) AS xproducto, cramo,
                 TRIM(xabreviatura) AS xabreviatura, iproductor, icanal
          FROM maproductos
          WHERE iproductor = 1 OR icanal = 1
          ORDER BY cproducto
        `);
        rows = fb.recordset ?? [];
      }

      return {
        productos: rows,
        mensaje: String(result.output['mensaje'] ?? ''),
        berror: Boolean(result.output['berror']),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getProductos: ${msg}`);
      throw new InternalServerErrorException('Error al buscar productos del canal.');
    }
  }

  /**
   * Paso 2 — planes por producto (spBuscaPlanProducto + parentescos).
   */
  async getPlanesProducto(body: GetPlanesProductoDto) {
    const { centidad, citem } = this.resolveCanalContext(body);
    const T = this.db.types;

    try {
      const req = this.db.request();
      req.input('cproducto', T.NVarChar(10), String(body.cproducto).trim());
      req.input('citem', T.NVarChar(20), citem);
      req.input('centidad', T.Char(1), citem ? centidad : null);
      req.output('mensaje', T.NVarChar(1000), '');

      const spResult = await req.execute('spBuscaPlanProducto');
      const planes = await this.enrichWithParentescos((spResult.recordset ?? []) as PlanCanalItem[]);

      return {
        plan: planes,
        mensaje: String(spResult.output['mensaje'] ?? ''),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPlanesProducto cproducto=${body.cproducto}: ${msg}`);
      throw new InternalServerErrorException('Error al buscar planes del producto.');
    }
  }

  /**
   * Paso 3 — detalle del plan (spBuscaDetallePlan).
   */
  async getPlanDetalle(body: GetPlanDetalleDto) {
    const T = this.db.types;
    const cramo = body.cramo ?? null;

    if (!cramo) {
      throw new BadRequestException('El parámetro cramo es requerido para planes/detalle.');
    }

    try {
      const req = this.db.request();
      req.input('cramo', T.Int, cramo);
      req.input('cplan', T.Char(6), String(body.cplan).trim());
      req.output('berror', T.Bit, false);
      req.output('mensaje', T.NVarChar(60), '');

      const spResult = await req.execute('spBuscaDetallePlan');
      const recordsets = spResult.recordsets as Record<string, unknown>[][] | undefined;

      if (spResult.output['berror']) {
        throw new BadRequestException(
          String(spResult.output['mensaje'] ?? 'No se encontraron detalles para este plan'),
        );
      }

      const planRow = recordsets?.[0]?.[0] ?? spResult.recordset?.[0] ?? {};
      const detalle: PlanCanalItem = { ...(planRow as Record<string, unknown>) };
      if (recordsets && recordsets.length > 1) {
        detalle.parentescos = recordsets[1] ?? [];
      }
      if (recordsets && recordsets.length > 2) {
        detalle.coberturas = recordsets[2] ?? [];
      }

      return { plan: detalle };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPlanDetalle cplan=${body.cplan}: ${msg}`);
      throw new InternalServerErrorException('Error al obtener detalle del plan.');
    }
  }

  /**
   * Resuelve cplan por ramo + días de vigencia (viajero local — fb_viajero_local).
   * Réplica de POST /api/v1/products/plan/frecuency en SysIP Express.
   */
  async getPlanPorDias(body: GetPlanPorDiasDto) {
    const T = this.db.types;

    try {
      const req = this.db.request();
      req.input('cramo', T.Int, body.cramo);
      req.input('ndias', T.Int, body.ndias);

      let result = await req.query<{ cplan: string; cramo: number; ndias: number }>(`
        SELECT TRIM(a.cplan) AS cplan, a.cramo, a.ndias
        FROM maplanes_frec a
        INNER JOIN maplanes_per b ON a.cplan = b.cplan AND a.cramo = b.cramo
        WHERE a.cramo = @cramo AND a.ndias = @ndias
      `);

      if (!(result.recordset?.length)) {
        result = await req.query(`
          SELECT TRIM(a.cplan) AS cplan, a.cramo, a.ndias
          FROM maplanes_frec a
          INNER JOIN maplanes_per b ON a.cplan = b.cplan AND a.cramo = b.cramo
          WHERE a.cramo = @cramo AND a.ndias IS NULL
        `);
      }

      const row = result.recordset?.[0];
      if (!row) {
        throw new BadRequestException(
          `No hay plan en maplanes_frec para cramo=${body.cramo} ndias=${body.ndias}`,
        );
      }

      return row;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPlanPorDias: ${msg}`);
      throw new InternalServerErrorException('Error al resolver plan por días.');
    }
  }

  /** Frecuencias de un plan incluyendo ndias (vigencia corta). */
  async getFrecuenciaConDias(cplan: string, cramo?: number) {
    const T = this.db.types;
    const req = this.db.request();
    req.input('cplan', T.VarChar(10), cplan.trim());

    let sql = `
      SELECT TRIM(ifrecuencia) AS ifrecuencia, TRIM(xfrecuencia) AS xfrecuencia,
             TRIM(cplan) AS cplan, ndias, cramo
      FROM maplanes_frec
      WHERE TRIM(cplan) = @cplan
    `;
    if (cramo != null) {
      req.input('cramo', T.Int, cramo);
      sql += ' AND cramo = @cramo';
    }

    const result = await req.query(sql);
    return result.recordset ?? [];
  }

  private async enrichWithParentescos(planes: PlanCanalItem[]): Promise<PlanCanalItem[]> {
    const T = this.db.types;
    for (const plan of planes) {
      try {
        const req = this.db.request();
        req.input('cramo', T.NVarChar(20), String(plan['cramo'] ?? ''));
        req.input('cplan', T.NVarChar(20), String(plan['cplan'] ?? '').trim());

        const result = await req.query(`
          SELECT A.cparen, TRIM(B.xparentesco) AS xparentesco,
                 C.cemin_ase AS min_edad, C.cemax_ase AS max_edad
          FROM mapltarifas_per A
          INNER JOIN maparent B ON B.cparentesco = A.cparen
          INNER JOIN mapledades_per C
                  ON C.cparen = A.cparen AND C.cramo = A.cramo AND C.cplan = A.cplan
          WHERE A.cramo = @cramo AND A.cplan = @cplan
          GROUP BY A.cparen, B.xparentesco, C.cemin_ase, C.cemax_ase
        `);
        plan.parentescos = result.recordset ?? [];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`enrichWithParentescos plan=${String(plan['cplan'])}: ${msg}`);
        plan.parentescos = [];
      }
    }
    return planes;
  }
}
