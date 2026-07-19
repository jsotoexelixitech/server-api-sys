import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { GetPlanesV2Dto } from './dto/get-planes-v2.dto';
import { GetCotizacionAutoDto } from './dto/get-cotizacion-auto.dto';

export interface CotizacionResult {
  mprimaext: number;
  mprima: number;
  ptasa: number;
}

export interface PlanItem {
  [key: string]: unknown;
  parentescos?: ParentescoPlan[];
  coberturas?: CoberturaPlan[];
}

interface ParentescoPlan {
  cparen: string;
  xparentesco: string;
  min_edad: number;
  max_edad: number;
}

interface CoberturaPlan {
  ccobertura: string;
  xcobertura: string;
}

@Injectable()
export class ValrepService {
  private readonly logger = new Logger(ValrepService.name);

  constructor(private readonly db: MssqlService) {}

  async getPlanesV2(body: GetPlanesV2Dto): Promise<PlanItem[]> {
    try {
      const req = this.db.request();
      const T = this.db.types;

      let citem: string | null = null;
      let centidad: string | null = null;

      if (body.citem) {
        // ítem específico: enviar ambos
        citem = String(body.citem);
        centidad = body.centidad ? String(body.centidad) : null;
      } else if (body.centidad && body.centidad !== 'G') {
        // entidad específica sin ítem
        centidad = String(body.centidad);
        citem = null;
      } else {
        // sin entidad o entidad 'G' (global) → NULL real en SQL
        citem = null;
        centidad = null;
      }

      req.input('cramo', T.Int, body.cramo);
      req.input('cproductor', T.Numeric(17), body.cproductor);
      req.input('ctipo', T.Numeric(4), body.ctipo);
      req.input('cusuario', T.NVarChar(60), String(body.cusuario));
      req.input('citem', T.NVarChar(50), citem);
      req.input('centidad', T.NVarChar(6), centidad);
      req.input('bnacional', T.Bit, body.iplaca === 'B');
      req.output('mensaje', T.NVarChar(500), '');

      const result = await req.execute('spBuscaPlan');
      const mensaje: string = result.output['mensaje'] ?? '';

      if (mensaje) {
        const isError = !mensaje.toLowerCase().includes('encontrad');
        if (isError) {
          this.logger.warn(`spBuscaPlan mensaje: ${mensaje}`);
        } else {
          this.logger.log(`spBuscaPlan: ${mensaje}`);
        }
      }

      const recordset = result.recordset ?? [];
      const planes = await this.enrichWithParentescos(recordset);
      return await this.enrichWithCoberturas(planes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPlanesV2 error: ${msg}`);
      throw new InternalServerErrorException(
        'Error al buscar planes. Intente nuevamente.',
      );
    }
  }

  // ── matipos ──────────────────────────────────────────────────────────────

  async getMatipos(): Promise<{ ctipo: number; xtipo: string }[]> {
    try {
      const req = this.db.request();
      const result = await req.query<{ ctipo: number; xtipo: string }>(`
        SELECT ctipo, TRIM(xtipo) AS xtipo FROM matipos ORDER BY ctipo
      `);
      return result.recordset ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getMatipos: ${msg}`);
      throw new InternalServerErrorException('Error al obtener tipos de vehículo.');
    }
  }

  // ── macategtr ────────────────────────────────────────────────────────────

  async getMacategtr(ctipo: string | number): Promise<{ ccategotr: string; xcategoria: string }[]> {
    try {
      const req = this.db.request();
      const T = this.db.types;
      req.input('ctipo', T.SmallInt, Number(ctipo));
      const result = await req.query<{ ccategotr: string; xcategoria: string }>(`
        SELECT
          ccategotr,
          TRIM(xcategoria) AS xcategoria
        FROM macategtr
        WHERE ctipo = @ctipo
        ORDER BY xcategoria
      `);
      return result.recordset ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getMacategtr: ${msg}`);
      throw new InternalServerErrorException('Error al obtener categorías.');
    }
  }

  // ── Estados ──────────────────────────────────────────────────────────────

  async getStates(): Promise<{ cestado: number; xdescripcion_l: string }[]> {
    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('xfiltros_json', T.NVarChar(500), JSON.stringify({ cpais: 58 }));
      req.input('cusuario', T.Numeric(13, 0), 0);

      const result = await req.execute('sp_ma_obtener_estados');
      const rows = (result.recordset ?? []) as { cvalor: number; xdescripcion: string }[];
      return rows.map((r) => ({
        cestado: Number(r.cvalor),
        xdescripcion_l: String(r.xdescripcion ?? '').trim(),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getStates: ${msg}`);
      throw new InternalServerErrorException('Error al obtener estados.');
    }
  }

  // ── Ciudades ─────────────────────────────────────────────────────────────

  async getCities(
    cestado?: number,
  ): Promise<{ cciudad: number; xdescripcion_l: string }[]> {
    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input(
        'xfiltros_json',
        T.NVarChar(500),
        cestado !== undefined ? JSON.stringify({ cestado }) : null,
      );
      req.input('cusuario', T.Numeric(13, 0), 0);

      const result = await req.execute('sp_ma_obtener_ciudades');
      const rows = (result.recordset ?? []) as { cvalor: number; xdescripcion: string }[];
      return rows.map((r) => ({
        cciudad: Number(r.cvalor),
        xdescripcion_l: String(r.xdescripcion ?? '').trim(),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getCities: ${msg}`);
      throw new InternalServerErrorException('Error al obtener ciudades.');
    }
  }

  // ── Cotización automóvil ─────────────────────────────────────────────────

  async getCotizacionAuto(body: GetCotizacionAutoDto): Promise<CotizacionResult> {
    try {
      const T = this.db.types;

      // 1. Tasa de cambio del dólar
      const rateReq = this.db.request();
      const rateResult = await rateReq.query<{ ptasamon: number }>(
        `SELECT ptasamon FROM mamonedas WHERE TRIM(cmoneda) = '$'`,
      );
      const ptasa: number = rateResult.recordset[0]?.ptasamon ?? 0;
      if (!ptasa) this.logger.warn('getCotizacionAuto: ptasa = 0 (verificar mamonedas)');

      // 2. tipoV y puestos desde VInma (parámetros del SP)
      const vinmaReq = this.db.request();
      vinmaReq.input('cmarca',   T.VarChar(4), body.cmarca);
      vinmaReq.input('cmodelo',  T.VarChar(4), body.cmodelo);
      vinmaReq.input('cversion', T.VarChar(4), body.cversion);
      vinmaReq.input('cano',     T.Int,        body.fano);
      const vinmaResult = await vinmaReq.query<{ ctipo: number; npasajero: number }>(
        `SELECT ctipo, npasajero
           FROM VInma
          WHERE cmarca   = @cmarca
            AND cmodelo  = @cmodelo
            AND cversion = @cversion
            AND cano     = @cano`,
      );
      const tipoV   = vinmaResult.recordset[0]?.ctipo    ?? 0;
      const puestos = vinmaResult.recordset[0]?.npasajero ?? 0;

      // 3. Fechas: póliza anual por defecto
      const fdesde = new Date();
      const fhasta = new Date();
      fhasta.setFullYear(fhasta.getFullYear() + 1);

      // 4. Ejecutar spCalculoAuto (replica exacta de externalChannelsModel.js)
      const calcReq = this.db.request();
      calcReq.input('cmarca',    T.VarChar(3),      body.cmarca);
      calcReq.input('cmodelo',   T.VarChar(3),      body.cmodelo);
      calcReq.input('cversion',  T.VarChar(3),      body.cversion);
      calcReq.input('cano',      T.Int,             body.fano);
      calcReq.input('cplan',     T.NVarChar(50),    body.cplan);
      calcReq.input('sumaAseg',  T.Numeric(18, 2),  null);
      calcReq.input('sumaAsegBl',T.Numeric(18, 2),  0);
      calcReq.input('sumaAsegAd',T.Numeric(18, 2),  0);
      calcReq.input('iplaca',    T.Char(1),         body.iplaca ?? 'N');
      calcReq.input('fdesde',    T.Date,            fdesde);
      calcReq.input('fhasta',    T.Date,            fhasta);
      calcReq.input('tasaPt',    T.Numeric(18, 2),  0);
      calcReq.input('tasaCa',    T.Numeric(18, 2),  0);
      calcReq.input('recargo',   T.Numeric(18, 0),  0);
      calcReq.input('tipoV',     T.Numeric(4, 0),   tipoV);
      calcReq.input('uso',       T.Numeric(4, 0),   body.ccategoria_uso);
      calcReq.input('puestos',   T.Numeric(4, 0),   puestos);
      calcReq.input('toneladas', T.Numeric(4, 0),   body.ntoneladas ?? 0);
      calcReq.input('recargoRcv',T.Numeric(6, 4),   0);
      calcReq.input('cramo',     T.Numeric(5, 0),   body.cramo ?? 18);

      const result = await calcReq.execute('spCalculoAuto');
      const rows: Record<string, unknown>[] = result.recordsets?.[0] ?? [];

      // 5. Filtrar coberturas PA (excluye casco/PT/PP: 1,2,3,4,5,16)
      const EXCLUDE_PA = new Set([1, 2, 3, 4, 5, 16]);
      const pa = rows.filter(
        (r) => !EXCLUDE_PA.has(parseInt(String(r['ccobertura']).trim())),
      );
      const totalPa = pa.reduce(
        (acc, r) => acc + (Number(r['prima']) || 0),
        0,
      );

      if (totalPa === 0) {
        this.logger.warn(
          `getCotizacionAuto: prima=0 para plan=${body.cplan} cmarca=${body.cmarca} cmodelo=${body.cmodelo} cversion=${body.cversion} fano=${body.fano} uso=${body.ccategoria_uso}`,
        );
        throw new BadRequestException(
          'La cotización retornó prima cero. Verifique que el plan y el vehículo sean compatibles.',
        );
      }

      const mprimaext = parseFloat(totalPa.toFixed(2));
      const mprima    = parseFloat((totalPa * ptasa).toFixed(2));

      this.logger.log(
        `getCotizacionAuto: plan=${body.cplan} fano=${body.fano} mprimaext=$${mprimaext} mprima=Bs${mprima} ptasa=${ptasa}`,
      );

      return { mprimaext, mprima, ptasa };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (err instanceof InternalServerErrorException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getCotizacionAuto error: ${msg}`);
      throw new BadRequestException(
        'No fue posible calcular la cotización con los datos suministrados. Verifique marca, modelo, versión y año.',
      );
    }
  }

  private async enrichWithParentescos(planes: PlanItem[]): Promise<PlanItem[]> {
    for (const plan of planes) {
      try {
        const req = this.db.request();
        const T = this.db.types;
        req.input('cramo', T.NVarChar(20), String(plan['cramo'] ?? ''));
        req.input('cplan', T.NVarChar(20), String(plan['cplan'] ?? ''));

        const result = await req.query<ParentescoPlan>(`
          SELECT
            A.cparen,
            TRIM(B.xparentesco)  AS xparentesco,
            C.cemin_ase          AS min_edad,
            C.cemax_ase          AS max_edad
          FROM  mapltarifas_per  A
          INNER JOIN maparent    B ON B.cparentesco = A.cparen
          INNER JOIN mapledades_per C
                  ON C.cparen = A.cparen
                 AND C.cramo  = A.cramo
                 AND C.cplan  = A.cplan
          WHERE A.cramo = @cramo
            AND A.cplan = @cplan
          GROUP BY A.cparen, B.xparentesco, C.cemin_ase, C.cemax_ase;
        `);

        plan.parentescos = result.recordset;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`enrichWithParentescos plan=${String(plan['cplan'])}: ${msg}`);
        plan.parentescos = [];
      }
    }
    return planes;
  }

  // ── getLists (catálogos vía SP) ───────────────────────────────────────────

  private static readonly ALLOWED_DOMAINS = ['SEXO', 'EDOCIVIL', 'PARENTESCOS', 'FRECUENCIAS', 'MATIPCANAL'];

  async getLists(cdominio: string): Promise<{ cvalor: string; xdescripcion: string }[]> {
    const domain = cdominio.toUpperCase().trim();

    if (!ValrepService.ALLOWED_DOMAINS.includes(domain)) {
      throw new BadRequestException(
        `Dominio no permitido: ${domain}. Válidos: ${ValrepService.ALLOWED_DOMAINS.join(', ')}`,
      );
    }

    const T = this.db.types;

    try {
      if (domain === 'PARENTESCOS') {
        const result = await this.db.request().execute('sp_ma_obtener_parentescos');
        const rows = (result.recordset ?? []) as { cvalor: string; xdescripcion: string }[];
        if (!rows.length) {
          throw new BadRequestException('No se encontraron parentescos.');
        }
        this.logger.log(`getLists PARENTESCOS: ${rows.length} items vía SP`);
        return rows;
      }

      const req = this.db.request();
      req.input('cdominio', T.VarChar(30), domain);
      req.input('xtipo_orden', T.VarChar(4), 'ASC');
      req.input('bactivos', T.Bit, true);
      const result = await req.execute('sp_macat_obtener_valores_dominio');
      const rows = (result.recordset ?? []) as { cvalor: string; xdescripcion: string }[];
      if (!rows.length) {
        throw new BadRequestException(`No se encontraron valores para el dominio ${domain}.`);
      }
      this.logger.log(`getLists ${domain}: ${rows.length} items vía SP`);
      return rows;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getLists ${domain}: ${msg}`);
      throw new InternalServerErrorException(`No se pudo obtener la lista ${domain}.`);
    }
  }

  async getFrecuencia(cplan: string, cramo?: number) {
    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('cplan', T.VarChar(10), cplan);
      req.input('cramo', T.Int, cramo ?? null);
      req.output('berror', T.Bit, false);
      req.output('mensaje', T.NVarChar(60), '');

      const result = await req.execute('spBuscaFrecuenciaPlan');
      const rows = (result.recordset ?? []) as { cvalor: string; xdescripcion: string }[];
      if (Boolean(result.output['berror']) || !rows.length) {
        throw new BadRequestException(
          String(result.output['mensaje'] ?? 'No se encontraron frecuencias para el plan.'),
        );
      }
      return rows;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getFrecuencia cplan=${cplan}: ${msg}`);
      throw new InternalServerErrorException('Error al obtener las frecuencias.');
    }
  }

  // ── Funerario: catálogo valrep (pasos 1–3, solo SP) ───────────────────────

  private resolveEntidadItem(body: { citem?: string; centidad?: string }) {
    let citem: string | null = null;
    let centidad: string | null = null;

    if (body.citem?.trim()) {
      citem = String(body.citem).trim();
      centidad = body.centidad?.trim() ? String(body.centidad).trim() : null;
    } else if (body.centidad?.trim() && body.centidad.trim() !== 'G') {
      centidad = String(body.centidad).trim();
    }

    return { citem, centidad };
  }

  private async fetchDetallePlanSp(
    cramo: number,
    cplan: string,
  ): Promise<{
    plan: PlanItem;
    parentescos: ParentescoPlan[];
    coberturas: CoberturaPlan[];
  }> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('cramo', T.Int, cramo);
    req.input('cplan', T.VarChar(10), cplan);
    req.output('berror', T.Bit, false);
    req.output('mensaje', T.NVarChar(60), '');

    const result = await req.execute('spBuscaDetallePlan');
    const berror = Boolean(result.output['berror']);
    const mensaje: string = result.output['mensaje'] ?? '';

    if (berror) {
      throw new BadRequestException(
        mensaje || 'No se encontraron detalles para este plan.',
      );
    }

    const sets = result.recordsets as [
      PlanItem[]?,
      ParentescoPlan[]?,
      CoberturaPlan[]?,
    ] | undefined;
    const base = sets?.[0] ?? ((result.recordset ?? []) as PlanItem[]);
    if (!base.length) {
      throw new BadRequestException('No se encontraron detalles para este plan.');
    }

    return {
      plan: { ...base[0] } as PlanItem,
      parentescos: sets?.[1] ?? [],
      coberturas: sets?.[2] ?? [],
    };
  }

  private async enrichPlanesWithDetalleSp(planes: PlanItem[]): Promise<PlanItem[]> {
    const enriched: PlanItem[] = [];
    for (const plan of planes) {
      const cramo = Number(plan['cramo']);
      const cplan = String(plan['cplan'] ?? '').trim();
      const detalle = await this.fetchDetallePlanSp(cramo, cplan);
      enriched.push({
        ...plan,
        parentescos: detalle.parentescos,
        coberturas: detalle.coberturas,
      });
    }
    return enriched;
  }

  /** Paso 1 funerario — spBuscaProductosEntidad (SysIP getProductos). */
  async getProductosPersonas(
    body: { citem: string; centidad: string },
  ): Promise<Record<string, unknown>[]> {
    const citem = String(body.citem).trim();
    const centidad = String(body.centidad).trim().toUpperCase();

    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('citem', T.NVarChar(20), citem);
      req.input('centidad', T.Char(1), centidad);
      req.output('berror', T.Bit, false);
      req.output('mensaje', T.NVarChar(60), '');

      const result = await req.execute('spBuscaProductosEntidad');
      const berror = Boolean(result.output['berror']);
      const mensaje: string = result.output['mensaje'] ?? '';
      const rows = (result.recordset ?? []) as Record<string, unknown>[];

      if (berror || !rows.length) {
        throw new BadRequestException(
          mensaje || 'No se encontraron productos para la entidad indicada.',
        );
      }

      return rows.map((row) => ({
        ...row,
        xdescripcion_l: row['xproducto'] ?? row['xdescripcion_l'],
      }));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getProductosPersonas citem=${citem} centidad=${centidad}: ${msg}`);
      throw new InternalServerErrorException(
        'Error al obtener productos de personas.',
      );
    }
  }

  /** Paso 2 funerario — spBuscaPlanProducto + parentescos vía spBuscaDetallePlan. */
  async getPlanesProducto(body: {
    cproducto: string;
    citem?: string;
    centidad?: string;
  }): Promise<{ planes: PlanItem[]; mensaje: string }> {
    const cproducto = String(body.cproducto).trim();
    const { citem, centidad } = this.resolveEntidadItem(body);

    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('cproducto', T.NVarChar(10), cproducto);
      req.input('citem', T.NVarChar(20), citem);
      req.input('centidad', T.Char(1), centidad);
      req.output('mensaje', T.NVarChar(60), '');

      const result = await req.execute('spBuscaPlanProducto');
      const mensaje: string = result.output['mensaje'] ?? '';
      const recordset = (result.recordset ?? []) as PlanItem[];
      if (!recordset.length) {
        throw new BadRequestException(mensaje || 'No se encuentra planes asociados');
      }

      const planes = await this.enrichPlanesWithDetalleSp(recordset);
      if (mensaje) this.logger.log(`spBuscaPlanProducto: ${mensaje}`);
      return { planes, mensaje };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPlanesProducto cproducto=${cproducto}: ${msg}`);
      throw new InternalServerErrorException(
        'Error al obtener planes del producto.',
      );
    }
  }

  /** Paso 3 funerario — spBuscaDetallePlan. */
  async getPlanesDetallePersonas(
    body: { cramo: number; cplan: string },
  ): Promise<PlanItem[]> {
    const cplan = String(body.cplan).trim();

    try {
      const detalle = await this.fetchDetallePlanSp(body.cramo, cplan);
      const plan = detalle.plan;
      if (detalle.parentescos.length) plan.parentescos = detalle.parentescos;
      if (detalle.coberturas.length) plan.coberturas = detalle.coberturas;
      return [plan];
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `getPlanesDetallePersonas cramo=${body.cramo} cplan=${cplan}: ${msg}`,
      );
      throw new InternalServerErrorException(
        'Error al obtener el detalle del plan.',
      );
    }
  }

  private async enrichWithCoberturas(planes: PlanItem[]): Promise<PlanItem[]> {
    for (const plan of planes) {
      try {
        const req = this.db.request();
        const T = this.db.types;
        req.input('cramo', T.NVarChar(20), String(plan['cramo'] ?? ''));
        req.input('cplan', T.NVarChar(20), String(plan['cplan'] ?? ''));

        const result = await req.query<CoberturaPlan>(`
          SELECT
            B.ccobertura,
            TRIM(B.xdescripcion_l) AS xcobertura
          FROM  maplcober_per A
          INNER JOIN macoberturas B
                  ON A.cramo     = B.cramo
                 AND A.ccobertura = B.ccobertura
          WHERE A.cramo = @cramo
            AND A.cplan = @cplan
        `);

        plan.coberturas = result.recordset;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`enrichWithCoberturas plan=${String(plan['cplan'])}: ${msg}`);
        plan.coberturas = [];
      }
    }
    return planes;
  }
}
