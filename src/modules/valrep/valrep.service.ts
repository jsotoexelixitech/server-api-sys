import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { parseSPError } from '../../common/helpers/sp-error.helper';
import { SP_CALCULO_AUTO_NEXUS, SP_GET_SUSTANCIAS_NEXUS } from '../../config/sis2000-sp.constants';
import { GetPlanesV2Dto } from './dto/get-planes-v2.dto';
import { GetCotizacionAutoDto } from './dto/get-cotizacion-auto.dto';
import { CalculatePlanCoberturasDto } from './dto/calculate-plan-coberturas.dto';

export interface CotizacionResult {
  mprimaext: number;
  mprima: number;
  ptasa: number;
  rates?: {
    CA: number;
    PT: number;
    PP: number;
  };
  referenceSuma?: number;
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

export interface CalculatePlanCoberturasRow {
  ccobertura?: number | string;
  xdescripcion_l?: string;
  prima?: number | null;
  masegurada?: number | null;
  cproducto?: string;
  [key: string]: unknown;
}

export interface CalculatePlanCoberturasTotals {
  totalPA?: number;
  totalCA?: number;
  totalPT?: number;
  totalAP?: number;
  totalPP?: number;
}

export interface CalculatePlanCoberturasResponse {
  message: string;
  status: true;
  mount: CalculatePlanCoberturasRow[];
  pa: number;
  ca: number;
  pt: number;
  ap: number;
  pp: number;
  boolPT: boolean;
  boolPP: boolean;
  boolCA: boolean;
  boolBl: boolean;
  boolAd: boolean;
  cproducto: string;
}

@Injectable()
export class ValrepService {
  private readonly logger = new Logger(ValrepService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  /** Placeholder Sis2000 en catálogos geo — no es estado/ciudad válido. */
  static isGeoCatalogPlaceholder(label: string): boolean {
    const t = String(label ?? '').trim().toUpperCase();
    return t === 'TODO' || t === 'TODOS' || t === 'TODAS';
  }

  private resolveRamoBinacional(): number {
    return parseInt(this.config.get<string>('LAMUNDIAL_RAMO_BINACIONAL', '28') ?? '28', 10);
  }

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
      return rows
        .map((r) => ({
          cestado: Number(r.cvalor),
          xdescripcion_l: String(r.xdescripcion ?? '').trim(),
        }))
        .filter((r) => r.xdescripcion_l && !ValrepService.isGeoCatalogPlaceholder(r.xdescripcion_l));
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
      return rows
        .map((r) => ({
          cciudad: Number(r.cvalor),
          xdescripcion_l: String(r.xdescripcion ?? '').trim(),
        }))
        .filter((r) => r.xdescripcion_l && !ValrepService.isGeoCatalogPlaceholder(r.xdescripcion_l));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getCities: ${msg}`);
      throw new InternalServerErrorException('Error al obtener ciudades.');
    }
  }

  /** ctipo, npasajero y suma de referencia desde VInma (paridad cotización). */
  private async resolveVinmaMeta(
    cmarca: string,
    cmodelo: string,
    cversion: string,
    cano: number,
  ): Promise<{ ctipo: number; npasajero: number; mvalor: number }> {
    const T = this.db.types;
    const vinmaReq = this.db.request();
    vinmaReq.input('cmarca', T.VarChar(4), cmarca);
    vinmaReq.input('cmodelo', T.VarChar(4), cmodelo);
    vinmaReq.input('cversion', T.VarChar(4), cversion);
    vinmaReq.input('cano', T.Int, cano);
    const vinmaResult = await vinmaReq.query<{
      ctipo: number;
      npasajero: number;
      mvalor?: number;
    }>(
      `SELECT ctipo, npasajero, mvalor
           FROM VInma
          WHERE cmarca   = @cmarca
            AND cmodelo  = @cmodelo
            AND cversion = @cversion
            AND cano     = @cano`,
    );
    const row = vinmaResult.recordset[0];
    if (!row) {
      throw new BadRequestException(
        'Vehículo no encontrado en catálogo INMA para la combinación marca/modelo/versión/año.',
      );
    }
    return {
      ctipo: Number(row.ctipo ?? 0),
      npasajero: Number(row.npasajero ?? 0),
      mvalor: Number(row.mvalor ?? 0) || 5000,
    };
  }

  // ── Cotización automóvil ─────────────────────────────────────────────────

  private spCalculoAutoNexusName(): string {
    return process.env.MSSQL_SP_CALCULO_AUTO_NEXUS?.trim() || SP_CALCULO_AUTO_NEXUS;
  }

  private spGetSustanciasNexusName(): string {
    return process.env.MSSQL_SP_GET_SUSTANCIAS_NEXUS?.trim() || SP_GET_SUSTANCIAS_NEXUS;
  }

  /** Coberturas casco/AP que spCalculoAuto excluye de totalPA (ramo RCV / binacional). */
  private static readonly COBER_EXCLUIDAS_TOTAL_PA = new Set([
    '1', '2', '3', '4', '5', '16', '28', '69',
  ]);

  /**
   * sp_calculo_auto_nexus con iplaca=B devuelve detalle pero a menudo NO el 2.º recordset
   * con totalPA (a diferencia de la rama nacional). Sumamos prima del detalle con la misma
   * regla que spCalculoAuto: coberturas fuera de casco/PT/PP/AP.
   */
  private sumPaFromDetalleBinacional(detalle: CalculatePlanCoberturasRow[]): number {
    return detalle.reduce((sum, row) => {
      const cc = String(row.ccobertura ?? '').trim();
      if (ValrepService.COBER_EXCLUIDAS_TOTAL_PA.has(cc)) return sum;
      return sum + Number(row.prima ?? 0);
    }, 0);
  }

  private formatLocalYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Vigencia cotización — misma lógica que emision policyMapper.resolveVigencia. */
  private resolveQuoteVigenciaYmd(ndias?: number | null): { fdesde: string; fhasta: string } {
    const fdesde = this.formatLocalYmd(new Date());
    const fhastaDate = new Date(`${fdesde}T12:00:00`);
    const n = ndias != null ? Number(ndias) : null;
    if (n != null && !Number.isNaN(n) && n > 0) {
      fhastaDate.setDate(fhastaDate.getDate() + n);
    } else if (n != null && !Number.isNaN(n) && n < 0) {
      fhastaDate.setDate(fhastaDate.getDate() + Math.abs(n));
    } else {
      fhastaDate.setFullYear(fhastaDate.getFullYear() + 1);
    }
    return { fdesde, fhasta: this.formatLocalYmd(fhastaDate) };
  }

  private resolveCusuarioSis2000(): number {
    const raw =
      process.env.LAMUNDIAL_CUSUARIO_PLANES
      ?? process.env.LAMUNDIAL_CUSUARIO_COBERTURAS
      ?? process.env.LAMUNDIAL_CUSUARIO
      ?? '6';
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 6;
  }

  private describeSqlError(err: unknown): string {
    const parsed = parseSPError(err).trim();
    if (parsed) return parsed;
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const info = (e.originalError as Record<string, unknown> | undefined)?.info;
      if (info && typeof info === 'object') {
        const infoMsg = String((info as Record<string, unknown>).message ?? '').trim();
        if (infoMsg) return infoMsg;
      }
      const number = e.number != null ? String(e.number) : '';
      const code = e.code != null ? String(e.code) : '';
      if (number || code) return `SQL error ${[code, number].filter(Boolean).join(' ')}`.trim();
    }
    return 'Error SQL sin mensaje (revisar sp_calculo_auto_nexus en Sis2000).';
  }

  /** POST /valrep/cotizacion — usa sp_calculo_auto_nexus (flujo Nexus), no spCalculoAuto legacy. */
  async getCotizacionAuto(body: GetCotizacionAutoDto): Promise<CotizacionResult> {
    try {
      const rateReq = this.db.request();
      const rateResult = await rateReq.query<{ ptasamon: number }>(
        `SELECT ptasamon FROM mamonedas WHERE TRIM(cmoneda) = '$'`,
      );
      const ptasa: number = rateResult.recordset[0]?.ptasamon ?? 0;
      if (!ptasa) this.logger.warn('getCotizacionAuto: ptasa = 0 (verificar mamonedas)');

      const vinma = await this.resolveVinmaMeta(
        body.cmarca,
        body.cmodelo,
        body.cversion,
        body.fano,
      );
      const mvalor = vinma.mvalor;
      const { fdesde, fhasta } = this.resolveQuoteVigenciaYmd(body.ndias);
      const ifrecuencia = String(body.ifrecuencia ?? 'A')
        .trim()
        .toUpperCase()
        .charAt(0) || 'A';

      const iplaca = body.iplaca ?? 'N';
      let cramo = body.cramo ?? 18;
      const ramoBinac = this.resolveRamoBinacional();
      if (iplaca === 'B' && cramo !== ramoBinac) {
        cramo = ramoBinac;
      }

      const calc = await this.calculatePlanCoberturas({
        cmarca: body.cmarca,
        cmodelo: body.cmodelo,
        cversion: body.cversion,
        cano: body.fano,
        idPlan: body.cplan,
        suma: body.sumaAsegurada ?? mvalor,
        iplaca,
        fdesde,
        fhasta,
        uso: body.ccategoria_uso,
        toneladas: body.ntoneladas ?? 0,
        cramo,
        ifrecuencia,
        coberAdicional: 'RC',
        sumaAsegBl: 0,
        sumaAsegAd: 0,
        recargo: 0,
        recargoRcv: body.precargorcv ?? 0,
        cusuario: this.resolveCusuarioSis2000(),
      });

      const mprimaext = calc.pa;
      if (mprimaext <= 0) {
        this.logger.warn(
          `getCotizacionAuto: prima=0 plan=${body.cplan} cmarca=${body.cmarca} cmodelo=${body.cmodelo} fano=${body.fano} iplaca=${iplaca} cramo=${cramo}`,
        );
        throw new BadRequestException(
          'La cotización retornó prima cero. Verifique que el plan y el vehículo sean compatibles.',
        );
      }

      const mprima = parseFloat((mprimaext * ptasa).toFixed(2));

      let rates = { CA: calc.ca, PT: calc.pt, PP: calc.pp };
      try {
        const T = this.db.types;
        const targetSuma = body.sumaAsegurada ?? mvalor;
        const rateQueryReq = this.db.request();
        rateQueryReq.input('cmarca', T.VarChar(4), body.cmarca);
        rateQueryReq.input('cmodelo', T.VarChar(4), body.cmodelo);
        rateQueryReq.input('cversion', T.VarChar(4), body.cversion);
        rateQueryReq.input('cano', T.Int, body.fano);
        rateQueryReq.input('suma', T.Numeric(18, 2), targetSuma);
        rateQueryReq.input('cplan', T.NVarChar(50), body.cplan);

        const rateQueryRes = await rateQueryReq.query<{
          tasaCA: number;
          tasaPT: number;
          tasaPP: number;
        }>(
          `SELECT
             dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '1', @suma, @cplan) AS tasaCA,
             dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '2', @suma, @cplan) AS tasaPT,
             dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '28', @suma, @cplan) AS tasaPP`,
        );

        rates = {
          CA: rateQueryRes.recordset[0]?.tasaCA ?? calc.ca,
          PT: rateQueryRes.recordset[0]?.tasaPT ?? calc.pt,
          PP: rateQueryRes.recordset[0]?.tasaPP ?? calc.pp,
        };
      } catch (rateErr) {
        const msg = rateErr instanceof Error ? rateErr.message : String(rateErr);
        this.logger.warn(`getCotizacionAuto: fn_buscar_tasa_casco falló, se usan tasas del SP Nexus: ${msg}`);
      }

      this.logger.log(
        `getCotizacionAuto: sp=${this.spCalculoAutoNexusName()} plan=${body.cplan} fano=${body.fano} mprimaext=$${mprimaext} mprima=Bs${mprima} ptasa=${ptasa}`,
      );

      return {
        mprimaext,
        mprima,
        ptasa,
        rates,
        referenceSuma: mvalor,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (err instanceof InternalServerErrorException) throw err;
      const msg = this.describeSqlError(err);
      this.logger.error(`getCotizacionAuto error: ${msg}`);
      throw new BadRequestException(
        msg.length > 0 && msg.length <= 180
          ? msg
          : 'No fue posible calcular la cotización con los datos suministrados. Verifique marca, modelo, versión y año.',
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

  private mapCatalogRows(
    rows: Record<string, unknown>[],
    codeKeys: string[],
    labelKeys: string[],
  ): { cvalor: string; xdescripcion: string }[] {
    return rows
      .map((row) => {
        const codeRaw = codeKeys.map((k) => row[k]).find((v) => v != null && String(v).trim() !== '');
        const labelRaw = labelKeys.map((k) => row[k]).find((v) => v != null && String(v).trim() !== '');
        return {
          cvalor: String(codeRaw ?? '').trim(),
          xdescripcion: String(labelRaw ?? '').trim(),
        };
      })
      .filter((item) => item.cvalor !== '' && item.xdescripcion !== '');
  }

  /** Profesiones / ocupaciones — sp_get_ocupaciones_nexus (campo cprofesion). */
  async getOcupacionesNexus(): Promise<{ cvalor: string; xdescripcion: string }[]> {
    try {
      const result = await this.db.request().execute('sp_get_ocupaciones_nexus');
      const rows = (result.recordset ?? []) as Record<string, unknown>[];
      const mapped = this.mapCatalogRows(rows, ['cprofesion', 'cocupacion', 'cvalor'], [
        'xprofesion',
        'xocupacion',
        'xdescripcion',
      ]);
      if (!mapped.length) {
        throw new BadRequestException('No se encontraron ocupaciones/profesiones.');
      }
      this.logger.log(`getOcupacionesNexus: ${mapped.length} items vía SP`);
      return mapped;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getOcupacionesNexus: ${msg}`);
      throw new InternalServerErrorException('No se pudo obtener la lista de profesiones.');
    }
  }

  /** Actividades económicas — sp_get_actividades_nexus (campo cactividad). */
  async getActividadesNexus(): Promise<{ cvalor: string; xdescripcion: string }[]> {
    try {
      const result = await this.db.request().execute('sp_get_actividades_nexus');
      const rows = (result.recordset ?? []) as Record<string, unknown>[];
      const mapped = this.mapCatalogRows(rows, ['cactividad', 'cvalor'], ['xactividad', 'xdescripcion']);
      if (!mapped.length) {
        throw new BadRequestException('No se encontraron actividades económicas.');
      }
      this.logger.log(`getActividadesNexus: ${mapped.length} items vía SP`);
      return mapped;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getActividadesNexus: ${msg}`);
      throw new InternalServerErrorException('No se pudo obtener la lista de actividades económicas.');
    }
  }

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
      const rows = (result.recordset ?? []) as {
        cvalor: string;
        xdescripcion: string;
        ndias?: number | null;
      }[];
      if (Boolean(result.output['berror']) || !rows.length) {
        throw new BadRequestException(
          String(result.output['mensaje'] ?? 'No se encontraron frecuencias para el plan.'),
        );
      }
      // El SP puede devolver varias filas con el mismo cvalor (A, B, D…).
      return rows.filter((row, index, all) => {
        const code = String(row.cvalor ?? '').trim();
        if (!code) return false;
        return all.findIndex((r) => String(r.cvalor ?? '').trim() === code) === index;
      });
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

  /**
   * Réplica SysIP `calculatePlanSis` usando `sp_calculo_auto_nexus` (flujo Nexus).
   */
  async calculatePlanCoberturas(
    body: CalculatePlanCoberturasDto,
  ): Promise<CalculatePlanCoberturasResponse> {
    const spName = this.spCalculoAutoNexusName();
    const cusuario =
      body.cusuario ?? this.resolveCusuarioSis2000();
    const ifrecuencia = String(body.ifrecuencia ?? 'A')
      .trim()
      .toUpperCase()
      .charAt(0) || 'A';

    try {
      const T = this.db.types;
      const vinma = await this.resolveVinmaMeta(
        body.cmarca,
        body.cmodelo,
        body.cversion,
        body.cano,
      );
      const tipoV = body.tipo ?? vinma.ctipo;
      const puestos = body.puestos ?? vinma.npasajero;
      const sumaAseg =
        body.suma != null && body.suma > 0 ? body.suma : vinma.mvalor || null;
      const iplaca = body.iplaca ?? 'N';
      const calcReq = this.db.request();

      calcReq.input('cmarca', T.NVarChar(4), body.cmarca);
      calcReq.input('cmodelo', T.NVarChar(4), body.cmodelo);
      calcReq.input('cversion', T.NVarChar(4), body.cversion);
      calcReq.input('cano', T.Int, body.cano);
      calcReq.input('cplan', T.VarChar(10), String(body.idPlan).trim());
      calcReq.input('sumaAseg', T.Numeric(18, 2), sumaAseg);
      calcReq.input('sumaAsegBl', T.Numeric(18, 2), body.sumaAsegBl ?? null);
      calcReq.input('sumaAsegAd', T.Numeric(18, 2), body.sumaAsegAd ?? null);
      calcReq.input('iplaca', T.Char(1), iplaca);
      calcReq.input('fdesde', T.Date, new Date(body.fdesde));
      calcReq.input('fhasta', T.Date, new Date(body.fhasta));
      calcReq.input('tasaPt', T.Numeric(18, 2), body.tasaPt ?? null);
      calcReq.input('tasaCa', T.Numeric(18, 2), body.tasaCa ?? null);
      calcReq.input('tasaPp', T.Numeric(18, 2), body.tasaPp ?? null);
      calcReq.input('recargo', T.Numeric(18, 2), body.recargo ?? null);
      calcReq.input('tipoV', T.Numeric(4), tipoV);
      calcReq.input('uso', T.Numeric(4), body.uso);
      calcReq.input('puestos', T.Numeric(4), puestos);
      calcReq.input('toneladas', T.Numeric(4), body.toneladas ?? 0);
      calcReq.input('recargoRcv', T.Numeric(6), body.recargoRcv ?? 0);
      calcReq.input('cramo', T.Numeric(4), body.cramo ?? 18);
      calcReq.input('cusuario', T.Numeric(20), cusuario);
      calcReq.input('coberAdicional', T.VarChar(2), body.coberAdicional ?? 'RC');
      calcReq.input('ifrecuencia', T.Char(1), ifrecuencia);

      const result = await calcReq.execute(spName);
      const recordsets = (result.recordsets ?? []) as CalculatePlanCoberturasRow[][];

      if (!recordsets.length) {
        throw new BadRequestException(
          'Error en cálculos, por favor validar información',
        );
      }

      const detalle = recordsets[0] ?? [];
      if (!detalle.length) {
        throw new BadRequestException(
          'Error en cálculos, por favor validar información',
        );
      }
      const precioRow = (recordsets[1]?.[0] ?? {}) as CalculatePlanCoberturasTotals;

      let totalPA = Number(precioRow.totalPA ?? 0);
      const totalCA = Number(precioRow.totalCA ?? 0);
      const totalPT = Number(precioRow.totalPT ?? 0);
      const totalAP = Number(precioRow.totalAP ?? 0);
      const totalPP = Number(precioRow.totalPP ?? 0);

      if (totalPA <= 0 && iplaca === 'B') {
        totalPA = this.sumPaFromDetalleBinacional(detalle);
        if (totalPA > 0) {
          this.logger.log(
            `calculatePlanCoberturas: totalPA binacional derivado del detalle (${detalle.length} filas) = ${totalPA}`,
          );
        }
      }

      const firstDetalle = detalle[0] as CalculatePlanCoberturasRow | undefined;
      const tipoPlan = String(firstDetalle?.cproducto ?? '').trim();

      this.logger.log(
        `calculatePlanCoberturas: plan=${body.idPlan} sp=${spName} iplaca=${iplaca} ifrecuencia=${ifrecuencia} pa=${totalPA} ca=${totalCA} pt=${totalPT}`,
      );

      return {
        message: 'Calculo generado con exito',
        status: true,
        mount: detalle,
        pa: totalPA,
        ca: totalCA,
        pt: totalPT,
        ap: totalAP,
        pp: totalPP,
        boolPT: totalPT > 0,
        boolPP: totalPP > 0,
        boolCA: totalCA > 0,
        boolBl: totalAP > 0,
        boolAd: totalAP > 0,
        cproducto: tipoPlan,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = this.describeSqlError(err);
      this.logger.error(
        `calculatePlanCoberturas error plan=${body.idPlan} cmarca=${body.cmarca} cmodelo=${body.cmodelo} cano=${body.cano} uso=${body.uso}: ${msg}`,
      );
      throw new BadRequestException(
        msg.length > 0 && msg.length <= 180
          ? msg
          : 'No fue posible calcular las coberturas del plan. Verifique marca, modelo, versión, año y plan.',
      );
    }
  }

  /** Catálogo recargo RCV — sp_get_sustancias_nexus @cramo → masustac (18 = RCV). */
  async getRecargosRcv(cramo = 18): Promise<
    Array<{ csustanc: string; xsustanc: string; porcenta: number }>
  > {
    const spName = this.spGetSustanciasNexusName();
    try {
      const T = this.db.types;
      const result = await this.db
        .request()
        .input('cramo', T.Int, cramo)
        .execute(spName);
      const rows = (result.recordset ?? []) as Array<{
        csustanc: string | number;
        xsustanc: string;
        porcenta: number;
      }>;
      const recargos = rows.map((row) => ({
        csustanc: String(row.csustanc ?? '').trim(),
        xsustanc: String(row.xsustanc ?? '').trim(),
        porcenta: Number(row.porcenta ?? 0),
      }));
      if (!recargos.length) {
        this.logger.warn(`getRecargosRcv: SP ${spName} cramo=${cramo} sin filas`);
      }
      return recargos;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getRecargosRcv sp=${this.spGetSustanciasNexusName()} cramo=${cramo}: ${msg}`);
      throw new InternalServerErrorException(
        'No se pudo obtener el catálogo de recargos RCV. Verifique sp_get_sustancias_nexus en Sis2000.',
      );
    }
  }
}
