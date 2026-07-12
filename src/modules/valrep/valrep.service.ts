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
      const req = this.db.request();
      let result = await req.query<{ cestado: number; xdescripcion_l: string }>(`
        SELECT cestado, TRIM(xdescripcion_l) AS xdescripcion_l
        FROM maestados
        WHERE cpais = 58
        ORDER BY xdescripcion_l
      `);
      let rows = result.recordset ?? [];
      if (!rows.length) {
        this.logger.warn('getStates: sin filas con cpais=58, consultando todos los estados');
        result = await this.db.request().query(`
          SELECT cestado, TRIM(xdescripcion_l) AS xdescripcion_l
          FROM maestados
          ORDER BY xdescripcion_l
        `);
        rows = result.recordset ?? [];
      }
      return rows;
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
      const req = this.db.request();
      const T = this.db.types;

      let query = `
        SELECT cciudad, TRIM(xdescripcion_l) AS xdescripcion_l
        FROM maciudades
      `;

      if (cestado !== undefined) {
        req.input('cestado', T.Int, cestado);
        query += ' WHERE cestado = @cestado';
      }

      query += ' ORDER BY xdescripcion_l';

      const result = await req.query<{ cciudad: number; xdescripcion_l: string }>(query);
      return result.recordset ?? [];
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

  // ── getLists ───────────────────────────────────────────────────────────────
  // Proxy hacia La Mundial QA. Si La Mundial falla, usa fallback de Sis2000
  // (PARENTESCOS) o valores fijos del dominio (SEXO, EDOCIVIL, FRECUENCIAS).

  private static readonly ALLOWED_DOMAINS = ['SEXO', 'EDOCIVIL', 'PARENTESCOS', 'FRECUENCIAS', 'MATIPCANAL'];

  private static readonly FALLBACK_LISTS: Record<string, { cvalor: string; xdescripcion: string }[]> = {
    SEXO: [
      { cvalor: 'M', xdescripcion: 'Masculino' },
      { cvalor: 'F', xdescripcion: 'Femenino' },
    ],
    EDOCIVIL: [
      { cvalor: 'S', xdescripcion: 'Soltero(a)' },
      { cvalor: 'C', xdescripcion: 'Casado(a)' },
      { cvalor: 'D', xdescripcion: 'Divorciado(a)' },
      { cvalor: 'V', xdescripcion: 'Viudo(a)' },
      { cvalor: 'U', xdescripcion: 'Unión Estable de Hecho' },
    ],
    FRECUENCIAS: [
      { cvalor: 'A', xdescripcion: 'Anual' },
      { cvalor: 'S', xdescripcion: 'Semestral' },
      { cvalor: 'T', xdescripcion: 'Trimestral' },
      { cvalor: 'M', xdescripcion: 'Mensual' },
    ],
    MATIPCANAL: [
      { cvalor: '1', xdescripcion: 'Directo' },
      { cvalor: '2', xdescripcion: 'Broker' },
      { cvalor: '3', xdescripcion: 'Banca-Seguros' },
    ],
    PARENTESCOS: [
      { cvalor: 'T', xdescripcion: 'TITULAR' },
      { cvalor: 'C', xdescripcion: 'CONYUGE' },
      { cvalor: 'H', xdescripcion: 'HIJO(A)' },
      { cvalor: 'P', xdescripcion: 'PADRE/MADRE' },
    ],
  };

  async getLists(cdominio: string): Promise<{ cvalor: string; xdescripcion: string }[]> {
    const domain = cdominio.toUpperCase().trim();

    if (!ValrepService.ALLOWED_DOMAINS.includes(domain)) {
      throw new BadRequestException(
        `Dominio no permitido: ${domain}. Válidos: ${ValrepService.ALLOWED_DOMAINS.join(', ')}`,
      );
    }

    const T = this.db.types;

    // PARENTESCOS → maparent (Sis2000 directo)
    if (domain === 'PARENTESCOS') {
      try {
        const result = await this.db.request().query<{ cvalor: string; xdescripcion: string }>(`
          SELECT TRIM(CAST(cparentesco AS VARCHAR(10))) AS cvalor,
                 TRIM(xparentesco) AS xdescripcion
          FROM maparent
          ORDER BY cparentesco
        `);
        const rows = result.recordset ?? [];
        if (rows.length > 0) {
          this.logger.log(`getLists PARENTESCOS: ${rows.length} items de Sis2000`);
          return rows;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`getLists PARENTESCOS DB: ${msg}`);
      }
    } else {
      // SEXO, EDOCIVIL, FRECUENCIAS, MATIPCANAL → macatvalores
      try {
        const req = this.db.request();
        req.input('cdom', T.NVarChar(30), domain);
        const result = await req.query<{ cvalor: string; xdescripcion: string }>(`
          SELECT TRIM(cvalor) AS cvalor, TRIM(xdescripcion) AS xdescripcion
          FROM macatvalores
          WHERE cdominio = @cdom AND bactivo = 1
          ORDER BY iorden, cvalor
        `);
        const rows = result.recordset ?? [];
        if (rows.length > 0) {
          this.logger.log(`getLists ${domain}: ${rows.length} items de macatvalores`);
          return rows;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`getLists ${domain} DB: ${msg}`);
      }
    }

    const fallback = ValrepService.FALLBACK_LISTS[domain];
    if (fallback?.length) {
      this.logger.warn(`getLists ${domain}: usando valores fijos (${fallback.length} items)`);
      return fallback;
    }

    throw new InternalServerErrorException(`No se pudo obtener la lista ${domain}.`);
  }

  async getFrecuencia(cplan: string) {
    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('cplan', T.VarChar(10), cplan);
      const result = await req.query<{ cvalor: string; xdescripcion: string }>(`
        SELECT TRIM(ifrecuencia) AS cvalor, TRIM(xfrecuencia) AS xdescripcion
        FROM maplanes_frec
        WHERE cplan = @cplan
      `);
      const rows = result.recordset ?? [];
      if (rows.length > 0) return rows;
      return ValrepService.FALLBACK_LISTS['FRECUENCIAS'];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getFrecuencia cplan=${cplan}: ${msg}`);
      throw new InternalServerErrorException('Error al obtener las frecuencias.');
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
