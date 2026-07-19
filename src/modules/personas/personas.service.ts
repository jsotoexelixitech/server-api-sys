import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { CotizacionPerDto } from './dto/cotizacion-per.dto';
import { CreateEmissionPersonDto } from './dto/create-emission-person.dto';
import { parseSPError } from '../../common/helpers/sp-error.helper';

class Mutex {
  private queue: Array<(release: () => void) => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise(resolve => {
      this.queue.push(resolve);
      this.dispatch();
    });
  }

  private dispatch() {
    if (this.locked) return;
    const next = this.queue.shift();
    if (next) {
      this.locked = true;
      next(() => {
        this.locked = false;
        this.dispatch();
      });
    }
  }
}
const emisionMutex = new Mutex();

export interface PlanPerItem {
  cplan: string;
  xplan: string;
  cramo: number;
  cmoneda?: string;
  parentescos?: Array<{ cparen: number; xparentesco: string; min_edad: number; max_edad: number }>;
}

export interface CotizacionPerResult {
  mprima: number;
  mprimaext: number;
  ptasa: number;
}

/** Formato legacy SysIP (`/app/getCotizacionPer`, `/external/getCotizacionPer`). */
export interface CotizacionPerLegacyResult {
  data: { total_asegurado: { mprima: number; mprimaext: number }[] }[];
  total_extension: { mprimatotal: number; mprimatotalext: number };
}

@Injectable()
export class PersonasService {
  private readonly logger = new Logger(PersonasService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  private intField(value: unknown): number | null {
    if (value == null || String(value).trim() === '') return null;
    const n = parseInt(String(value), 10);
    return Number.isNaN(n) ? null : n;
  }

  /** Flags char(1) que espera sp_pre_emision_Personas_General. */
  private spCharFlag(value: unknown, defaultVal = '0'): string {
    if (value == null || String(value).trim() === '') return defaultVal;
    return String(value).trim().charAt(0);
  }

  /** Último recordset con cnpoliza (sp_emision anidado en sp_pre_emision). */
  private extractEmissionRow(result: {
    recordset?: Record<string, unknown>[];
    recordsets?: Record<string, unknown>[][];
  }): Record<string, unknown> {
    if (result.recordsets?.length) {
      for (let i = result.recordsets.length - 1; i >= 0; i--) {
        const rs = result.recordsets[i];
        if (rs?.length && rs[0]?.['cnpoliza']) return rs[0];
      }
    }
    if (result.recordset?.length && result.recordset[0]?.['cnpoliza']) {
      return result.recordset[0];
    }
    return {};
  }

  /** JSON de asegurados al formato OPENJSON de sp_pre_emision_Personas_General. */
  private mapAseguradosForSp(
    lista: Record<string, unknown>[],
    getPar: (p: unknown) => number,
  ): string | null {
    if (!lista.length) return null;
    const mapped = lista.map((a) => ({
      tipo_cedula_asegurado: String(a.icedula_asegurado ?? a.tipoDoc ?? 'V').charAt(0),
      rif_asegurado: this.intField(a.xrif_asegurado ?? a.identificacion),
      nombre_asegurado: a.xnombre_asegurado ?? a.nombre ?? null,
      apellido_asegurado: a.xapellido_asegurado ?? a.apellido ?? null,
      sexo_asegurado: String(
        a.isexo_asegurado ?? (a.sexo ? String(a.sexo)[0].toUpperCase() : 'M'),
      ).charAt(0),
      estado_civil_asegurado: String(a.iestado_civil_asegurado ?? 'S').charAt(0),
      fnac_asegurado: a.fnac_asegurado ?? a.fechaNac ?? null,
      nparentesco_asegurado: getPar(a.nparentesco_asegurado ?? a.parentesco),
    }));
    return JSON.stringify(mapped);
  }

  /** JSON de beneficiarios al formato OPENJSON de sp_pre_emision_Personas_General. */
  private mapBeneficiariosForSp(
    lista: Record<string, unknown>[],
    getPar: (p: unknown) => number,
  ): string | null {
    if (!lista.length) return null;
    const mapped = lista.map((b) => ({
      tipo_cedula_beneficiario: String(b.icedula_beneficiario ?? b.tipoDoc ?? 'V').charAt(0),
      rif_beneficiario: this.intField(b.xrif_beneficiario ?? b.identificacion),
      nombre_beneficiario: b.xnombre_beneficiario ?? b.nombre ?? null,
      apellido_beneficiario: b.xapellido_beneficiario ?? b.apellido ?? null,
      sexo_beneficiario: String(
        b.isexo_beneficiario ?? (b.sexo ? String(b.sexo)[0].toUpperCase() : 'M'),
      ).charAt(0),
      estado_civil_beneficiario: String(b.iestado_civil_beneficiario ?? 'S').charAt(0),
      fnac_beneficiario: b.fnac_beneficiario ?? b.fechaNac ?? null,
      nparentesco_beneficiario: getPar(b.nparentesco_beneficiario ?? b.parentesco),
    }));
    return JSON.stringify(mapped);
  }

  private async lookupEmissionByTitular(rifTitular: number): Promise<Record<string, unknown>> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('casegurado', T.Numeric(9, 0), rifTitular);
    const result = await req.execute('spGetPolizaRecienteTitular');
    return (result.recordset?.[0] ?? {}) as Record<string, unknown>;
  }

  private get defaultRamo(): number {
    return this.config.get<number>('LAMUNDIAL_RAMO_PERSON', 9);
  }

  // Lista blanca de planes funerarios individuales a exponer (catálogo oficial de
  // producción para cproducto=57: 4/6/7/8). En QA esos planes existen en
  // maplanes_per (ramo 9, vigentes) aunque con cproducto distinto, por eso se
  // filtran por cplan explícito y no por cproducto. Configurable por env.
  private get funeralPlanCodes(): string[] {
    return this.config
      .get<string>('LAMUNDIAL_PLANES_FUNERARIO', '4,6,7,8')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // ── Planes de personas (spGetPlanesPerFunerario) ───────────────────────────

  async getPlanesPer(cramo?: number, _ctipo?: number | null): Promise<PlanPerItem[]> {
    try {
      const T = this.db.types;
      const ramo = cramo ?? this.defaultRamo;
      const codes = this.funeralPlanCodes;

      const req = this.db.request();
      req.input('cramo', T.Int, ramo);
      req.input(
        'cplanes',
        T.NVarChar(200),
        codes.length > 0 ? codes.join(',') : null,
      );

      const result = await req.execute('spGetPlanesPerFunerario');
      const planRows = (result.recordsets?.[0] ??
        result.recordset ??
        []) as Record<string, unknown>[];
      const parentRows = (result.recordsets?.[1] ?? []) as Record<string, unknown>[];

      const parentescosByPlan = new Map<
        string,
        PlanPerItem['parentescos']
      >();
      for (const row of parentRows) {
        const cplan = String(row['cplan'] ?? '').trim();
        if (!cplan) continue;
        const list = parentescosByPlan.get(cplan) ?? [];
        list.push({
          cparen: Number(row['cparen']),
          xparentesco: String(row['xparentesco'] ?? '').trim(),
          min_edad: Number(row['min_edad']),
          max_edad: Number(row['max_edad']),
        });
        parentescosByPlan.set(cplan, list);
      }

      return planRows
        .map((p) => {
          const cplan = String(p['cplan'] ?? '').trim();
          return {
            cplan,
            xplan: String(p['xplan'] ?? '').trim(),
            cramo: Number(p['cramo'] ?? ramo),
            cmoneda: String(p['cmoneda'] ?? '').trim() || undefined,
            parentescos: parentescosByPlan.get(cplan) ?? [],
          };
        })
        .filter((p) => p.cplan);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPlanesPer: ${msg}`);
      throw new InternalServerErrorException('Error al obtener los planes de personas.');
    }
  }

  async getParenPlanPer(cramo: number, cplan: string) {
    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('cramo', T.Int, cramo);
      req.input('cplan', T.VarChar(10), cplan);
      req.output('berror', T.Bit, false);
      req.output('mensaje', T.NVarChar(60), '');

      const result = await req.execute('spBuscaDetallePlan');
      if (Boolean(result.output['berror'])) {
        throw new BadRequestException(
          String(result.output['mensaje'] ?? 'No se encontraron parentescos.'),
        );
      }

      const parentRows = (result.recordsets?.[1] ?? []) as Record<string, unknown>[];
      return parentRows.map((row) => ({
        cparen: Number(row['cparen']),
        xparentesco: String(row['xparentesco'] ?? '').trim(),
      }));
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getParenPlanPer plan=${cplan}: ${msg}`);
      throw new InternalServerErrorException('Error al obtener los parentescos del plan.');
    }
  }

  // ── Cotización de personas (spCalculoPer por asegurado, sumando) ───────────

  async getCotizacionPer(body: CotizacionPerDto): Promise<CotizacionPerResult> {
    try {
      const T = this.db.types;
      const ramo = body.cramo ?? this.defaultRamo;

      // Tasa: la enviada o NULL — spCalculoPer resuelve ptasamon desde mamonedas.
      const ptasamon = body.ptasamon ?? null;

      let mprimatotal = 0;
      let mprimatotalext = 0;

      for (const asegurado of body.asegurados) {
        const req = this.db.request();
        req.input('ptasamon', T.Numeric(13, 6), ptasamon);
        req.input('cramo', T.Int, ramo);
        req.input('cplan', T.VarChar(10), body.cplan);
        req.input('cparen', T.Int, asegurado.cparen);
        req.input('xrif_asegurado', T.VarChar(10), String(asegurado.xrif_asegurado).replace(/\D/g, ''));
        req.input('nedad_asegurado', T.Int, asegurado.nedad_asegurado);
        req.input('ifrecuencia', T.Char(1), body.ifrecuencia);
        req.input('msumaaseg', T.Numeric(18, 2), body.msumaaseg ?? null);

        const result = await req.execute('spCalculoPer');
        const totals = (result.recordsets?.[1] ?? []) as Record<string, unknown>[];
        if (totals.length > 0) {
          mprimatotal += Number(totals[0]['mprima']) || 0;
          mprimatotalext += Number(totals[0]['mprimaext']) || 0;
        }
      }

      if (mprimatotalext === 0 && mprimatotal === 0) {
        throw new BadRequestException(
          'La cotización retornó prima cero. Verifique el plan, los parentescos y las edades de los asegurados.',
        );
      }

      const mprimaext = parseFloat(mprimatotalext.toFixed(2));
      const mprima = parseFloat(mprimatotal.toFixed(2));
      const ptasa = mprimaext > 0
        ? parseFloat((mprima / mprimaext).toFixed(4))
        : (body.ptasamon ?? 0);

      this.logger.log(
        `getCotizacionPer: plan=${body.cplan} asegurados=${body.asegurados.length} mprimaext=$${mprimaext} mprima=Bs${mprima}`,
      );

      return { mprima, mprimaext, ptasa };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getCotizacionPer: ${msg}`);
      throw new BadRequestException(msg);
    }
  }

  /**
   * Cotización por asegurado en formato legacy SysIP (external/app).
   * Réplica de `appModel.spGetCotizacionPer` + `externalChannelsController.getCotizacionPerson`.
   */
  async buildCotizacionPerLegacyResult(
    dto: CotizacionPerDto,
  ): Promise<CotizacionPerLegacyResult> {
    const data: CotizacionPerLegacyResult['data'] = [];
    let mprimatotal = 0;
    let mprimatotalext = 0;

    for (const asegurado of dto.asegurados) {
      const result = await this.getCotizacionPer({
        ...dto,
        asegurados: [asegurado],
      });
      data.push({
        total_asegurado: [
          { mprima: result.mprima, mprimaext: result.mprimaext },
        ],
      });
      mprimatotal += result.mprima;
      mprimatotalext += result.mprimaext;
    }

    return {
      data,
      total_extension: {
        mprimatotal: parseFloat(mprimatotal.toFixed(2)),
        mprimatotalext: parseFloat(mprimatotalext.toFixed(2)),
      },
    };
  }

  // ── Validación de persona (speeValidatePersonGeneral) ──────────────────────
  async validateEmissionPerson(body: Record<string, unknown>) {
    const req = this.db.request();
    const T = this.db.types;
    req.input('cramo',        T.Int,          body.cramo);
    req.input('cplan',        T.VarChar(10),  body.plan);
    req.input('femision',     T.Date,         body.femision);
    req.input('xrif_titular', T.Numeric(9),   body.rif_titular);
    req.input('fnac_titular', T.DateTime,     body.fnac_titular);
    try {
      await req.execute('speeValidatePersonGeneral');
      return { status: true, message: 'Persona válida para emisión.' };
    } catch (err) {
      const msg = parseSPError(err);
      this.logger.warn(`validateEmissionPerson (SP validation error): ${msg}`);
      return { status: false, error: msg };
    }
  }

  // ── Emisión de póliza de personas (sp_pre_emision_Personas_General) ────────

  async createEmissionPerson(apikey: string, body: CreateEmissionPersonDto) {
    const release = await emisionMutex.acquire();
    try {
      return await this._createEmissionPerson(apikey, body);
    } finally {
      release();
    }
  }

  private async _createEmissionPerson(apikey: string, body: CreateEmissionPersonDto) {
    try {
      const T = this.db.types;

      // 1. Canal emisor vía spGetMaclientApi. Si el token no existe, usa defaults.
      const authReq = this.db.request();
      authReq.input('xtoken', T.VarChar(100), apikey);
      const authResult = await authReq.execute('spGetMaclientApi');
      const canal: Record<string, unknown> = authResult.recordset.length
        ? authResult.recordset[0]
        : {
            cproductor: this.config.get<number>('LAMUNDIAL_PRODUCTOR', 80080),
            xcanal_venta: 'ExelixiTech-Funerario',
            corigen_rel: 'WE',
            ifuente_api: 'API',
            cprog: 'eePoliza_PerGe',
            ctipocanal: null,
            ccanalalt: null,
            cscanalalt: null,
          };

      const b = body as unknown as Record<string, unknown>;

      // 2a. Tasa y suma: NULL — sp_emision_Personas_General resuelve ptasamon desde
      //     mamonedas y msumaaseg desde mapltabedad_d (no enviar msuma del catálogo).
      const ptasamonResolved: number | null = null;
      const msumaasegResolved: number | null = null;

      // 2. Fechas: si no vienen fdesde/fhasta se derivan de fecha_emision (1 año).
      const femision = String(b['fecha_emision'] ?? '').trim();
      const fdesde = String(b['fdesde'] ?? femision).trim();
      let fhasta = String(b['fhasta'] ?? '').trim();
      if (!fhasta && femision) {
        const d = new Date(`${femision}T00:00:00Z`);
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        d.setUTCDate(d.getUTCDate() - 1);
        fhasta = d.toISOString().slice(0, 10);
      }

      const canalCtipo = canal['ctipocanal'] as string | null | undefined;
      const ctipocanal = (b['ctipocanal'] ??
        ((canalCtipo === 'T' || canalCtipo === 'A' || canalCtipo === 'D') ? canalCtipo : null)) as string | null;
      const ccanalalt = (b['ccanalalt'] ??
        ((canalCtipo === 'T' || canalCtipo === 'A' || canalCtipo === 'D') ? canal['ccanalalt'] : null)) as number | null;
      const cscanalalt = (b['cscanalalt'] ??
        ((canalCtipo === 'T' || canalCtipo === 'A' || canalCtipo === 'D') ? canal['cscanalalt'] : null)) as number | null;

      const getPar = (p: any) => {
        if (typeof p === 'number') return p;
        if (typeof p === 'string') {
          const n = parseInt(p, 10);
          if (!isNaN(n)) return n;
          const s = p.toLowerCase();
          if (s.includes('titular')) return 1;
          if (s.includes('conyug') || s.includes('cónyug')) return 2;
          if (s.includes('hij')) return 3;
          if (s.includes('padre') || s.includes('madre')) return 4;
          return 5;
        }
        return 1;
      };

      const asegurados = Array.isArray(b['asegurados'])
        ? b['asegurados']
        : (b['funeral'] && typeof b['funeral'] === 'object' && Array.isArray((b['funeral'] as any)['asegurados'])
          ? (b['funeral'] as any)['asegurados']
          : []);

      const beneficiarios = Array.isArray(b['beneficiarios'])
        ? b['beneficiarios']
        : (b['funeral'] && typeof b['funeral'] === 'object' && Array.isArray((b['funeral'] as any)['beneficiarios'])
          ? (b['funeral'] as any)['beneficiarios']
          : []);

      // === LLAMADA A LA NUEVA API QAAPISYS2000 (PRIMER INTENTO) ===
      const ENABLE_QAAPISYS2000 = false; // Deshabilitado para forzar la emisión local directa
      if (!ENABLE_QAAPISYS2000) {
        this.logger.log('qaapisys2000 disabled - usando emisión local en Sis2000 directamente');
      }

      const payloadAPI = {
          cramo: b['cramo'] ?? 9,
          plan: String(b['plan'] ?? '6'),
          tipo_cedula_tomador: String(b['tipo_cedula_tomador'] ?? b['cedula_tomador'] ?? 'V'),
          rif_tomador: Number(b['rif_tomador']),
          nombre_tomador: String(b['nombre_tomador'] ?? ''),
          apellido_tomador: String(b['apellido_tomador'] ?? ''),
          telefono_tomador: String(b['telefono_tomador'] ?? ''),
          correo_tomador: String(b['correo_tomador'] ?? ''),
          fnac_tomador: b['fnac_tomador'] ? String(b['fnac_tomador']) : (b['fechaNac'] ? String(b['fechaNac']) : null),
          isexo_tomador: String(b['sexo_tomador'] ?? b['isexo_tomador'] ?? 'M'),
          iestado_civil_tomador: String(b['estado_civil_tomador'] ?? b['iestado_civil_tomador'] ?? 'S'),
          estado_tomador: Number(b['estado_tomador'] ?? 1),
          ciudad_tomador: Number(b['ciudad_tomador'] ?? 128),
          direccion_tomador: String(b['direccion_tomador'] ?? 'No indicada'),
          
          tipo_cedula_titular: String(b['tipo_cedula_titular'] ?? b['cedula_titular'] ?? 'V'),
          rif_titular: Number(b['rif_titular']),
          nombre_titular: String(b['nombre_titular'] ?? ''),
          apellido_titular: String(b['apellido_titular'] ?? ''),
          telefono_titular: String(b['telefono_titular'] ?? ''),
          correo_titular: String(b['correo_titular'] ?? ''),
          fnac_titular: b['fnac_titular'] ? String(b['fnac_titular']) : (b['fechaNac'] ? String(b['fechaNac']) : null),
          isexo_titular: String(b['sexo_titular'] ?? b['isexo_titular'] ?? 'M'),
          iestado_civil_titular: String(b['estado_civil_titular'] ?? b['iestado_civil_titular'] ?? 'S'),
          estado_titular: Number(b['estado_titular'] ?? 1),
          ciudad_titular: Number(b['ciudad_titular'] ?? 128),
          direccion_titular: String(b['direccion_titular'] ?? 'No indicada'),
          
          dec_persona_politica: Number(b['dec_persona_politica'] ?? 0),
          cpersona_politica: Number(b['cpersona_politica'] ?? 0),
          dec_term_y_cod: Number(b['dec_term_y_cod'] ?? 1),
          cterm_y_cod: Number(b['cterm_y_cod'] ?? 1),
          dec_diagnos_enferm: Number(b['dec_diagnos_enferm'] ?? 0),
          cdiagnos_enferm: Number(b['cdiagnos_enferm'] ?? 0),
          
          cproductor: Number(b['productor'] ?? canal['cproductor'] ?? 80080),
          frecuencia: String(b['frecuencia'] ?? b['ifrecuencia'] ?? 'M'),
          
          fecha_emision: femision,
          fdesde: fdesde,
          fhasta: fhasta,
          
          asegurados: asegurados.map((a: any) => ({
            icedula_asegurado: String(a.icedula_asegurado ?? a.tipoDoc ?? 'V'),
            xrif_asegurado: String(a.xrif_asegurado ?? a.identificacion),
            xnombre_asegurado: String(a.xnombre_asegurado ?? a.nombre),
            xapellido_asegurado: String(a.xapellido_asegurado ?? a.apellido),
            fnac_asegurado: a.fnac_asegurado ? String(a.fnac_asegurado) : (a.fechaNac ? String(a.fechaNac) : null),
            isexo_asegurado: String(a.isexo_asegurado ?? (a.sexo ? String(a.sexo)[0].toUpperCase() : 'M')),
            nparentesco_asegurado: Number(getPar(a.nparentesco_asegurado ?? a.parentesco)),
            iestado_civil_asegurado: String(a.iestado_civil_asegurado ?? 'S')
          })),
          beneficiarios: beneficiarios.map((a: any) => ({
            icedula_beneficiario: String(a.icedula_beneficiario ?? a.tipoDoc ?? 'V'),
            xrif_beneficiario: String(a.xrif_beneficiario ?? a.identificacion),
            xnombre_beneficiario: String(a.xnombre_beneficiario ?? a.nombre),
            xapellido_beneficiario: String(a.xapellido_beneficiario ?? a.apellido),
            fnac_beneficiario: a.fnac_beneficiario ? String(a.fnac_beneficiario) : (a.fechaNac ? String(a.fechaNac) : null),
            isexo_beneficiario: String(a.isexo_beneficiario ?? (a.sexo ? String(a.sexo)[0].toUpperCase() : 'M')),
            nparentesco_beneficiario: Number(getPar(a.nparentesco_beneficiario ?? a.parentesco))
          }))
        };

        const EXTERNAL_API_URL = this.config.get<string>('EXTERNAL_API_URL_PERSON', 'https://qaapisys2000.lamundialdeseguros.com/api/v1/external/createEmissionPerson');
        const EXTERNAL_API_KEY = this.config.get<string>('EXTERNAL_API_KEY', '');
        const EXTERNAL_BASIC_AUTH = this.config.get<string>('EXTERNAL_BASIC_AUTH', '');

        this.logger.log(`=== INICIO EMISION FUNERARIO ===`);
        this.logger.log(`1. PAYLOAD RECIBIDO DEL FRONTEND: ${JSON.stringify(b)}`);
        this.logger.log(`2. URL DESTINO API LA MUNDIAL: ${EXTERNAL_API_URL}`);
        this.logger.log(`3. PAYLOAD TRANSFORMADO HACIA LA MUNDIAL: ${JSON.stringify(payloadAPI)}`);
        
        let useFallback = !ENABLE_QAAPISYS2000;
        let resData: any = {};
        let response: Response | null = null;
        let errMsg = 'Error desconocido desde la API';

        if (ENABLE_QAAPISYS2000) {
          try {
            response = await fetch(EXTERNAL_API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': EXTERNAL_API_KEY,
                'Authorization': EXTERNAL_BASIC_AUTH
              },
              body: JSON.stringify(payloadAPI),
              signal: AbortSignal.timeout(15000)
            });
            
            resData = await response.json().catch(() => ({}));
            this.logger.log(`4. RESPUESTA DE LA MUNDIAL [HTTP ${response.status}]: ${JSON.stringify(resData)}`);
            
            if (response.status >= 500) {
               this.logger.warn(`API La Mundial retornó HTTP ${response.status}, activando fallback...`);
               useFallback = true;
            } else if (!response.ok) {
               errMsg = `HTTP ${response.status}`;
               if (resData) {
                 if (typeof resData.result?.result?.error === 'string') errMsg = resData.result.result.error;
                 else if (typeof resData.result?.error === 'string') errMsg = resData.result.error;
                 else if (resData.result?.message) errMsg = resData.result.message;
                 else if (resData.message) errMsg = resData.message;
                 else if (resData.error && typeof resData.error === 'string') errMsg = resData.error;
                 
                 if (Array.isArray(resData.errors)) {
                   const arrErrs = resData.errors.map((e: any) => e.mensaje || e.message || JSON.stringify(e)).join(', ');
                   if (arrErrs) errMsg = `${errMsg} - Detalles: ${arrErrs}`;
                 }
               }
               this.logger.error(`Error llamando API La Mundial Funerario: ${errMsg}`);
               throw new BadRequestException(errMsg);
            }
          } catch (err) {
            if (err instanceof BadRequestException) throw err;
            this.logger.warn(`Falla de red o timeout comunicando con La Mundial: ${err instanceof Error ? err.message : String(err)}, activando fallback...`);
            useFallback = true;
          }
        }

        if (!useFallback && response?.ok && resData && (resData.status === true || resData.success === true)) {
           this.logger.log(`=== FIN EMISION FUNERARIO ===`);
           const dataObj = resData.result || resData.data || resData;
           return {
             message: resData.message || 'Emisión registrada exitosamente via API La Mundial.',
             cnpoliza: dataObj.poliza || dataObj.cnpoliza || '',
             cnrecibo: dataObj.recibo || dataObj.cnrecibo || '',
             urlpoliza: dataObj.urlpoliza || '',
             ncuota: dataObj.ncuota || 1,
             fanopol: new Date().getFullYear(),
             fmespol: new Date().getMonth() + 1,
             raw: resData
           };
        }

        // Emisión local vía SP de producción (SysIP fb_organizacion_swagger / main actual).
        this.logger.log(`=== INICIO EMISION LOCAL SP sp_pre_emision_Personas_General ===`);

        const req = this.db.request();
        const params: Record<string, { type: unknown; value: unknown }> = {
          cnpoliza_rel: { type: T.NVarChar(30), value: b['poliza'] ? String(b['poliza']) : null },
          cramo: { type: T.Int, value: this.intField(b['cramo']) ?? 9 },
          cplan: { type: T.NVarChar(10), value: String(b['plan'] ?? '') },
          icedula_tomador: {
            type: T.Char(1),
            value: String(b['tipo_cedula_tomador'] ?? b['cedula_tomador'] ?? 'V').charAt(0),
          },
          xrif_tomador: { type: T.Numeric(11, 0), value: this.intField(b['rif_tomador']) },
          xnombre_tomador: { type: T.NVarChar(250), value: b['nombre_tomador'] ?? null },
          xapellido_tomador: { type: T.NVarChar(250), value: b['apellido_tomador'] ?? null },
          isexo_tomador: { type: T.Char(1), value: b['sexo_tomador'] ?? null },
          iestado_civil_tomador: { type: T.Char(1), value: b['estado_civil_tomador'] ?? null },
          fnac_tomador: { type: T.Date, value: b['fnac_tomador'] ?? null },
          cestado_tomador: { type: T.SmallInt, value: this.intField(b['estado_tomador']) },
          cciudad_tomador: { type: T.SmallInt, value: this.intField(b['ciudad_tomador']) },
          xdireccion_tomador: { type: T.NVarChar(1000), value: b['direccion_tomador'] ?? null },
          xtelefono_tomador: { type: T.NVarChar(250), value: b['telefono_tomador'] ?? null },
          xcorreo_tomador: { type: T.NVarChar(250), value: b['correo_tomador'] ?? null },
          icedula_titular: {
            type: T.Char(1),
            value: String(b['tipo_cedula_titular'] ?? b['cedula_titular'] ?? 'V').charAt(0),
          },
          xrif_titular: { type: T.Numeric(11, 0), value: this.intField(b['rif_titular']) },
          xnombre_titular: { type: T.NVarChar(250), value: b['nombre_titular'] ?? null },
          xapellido_titular: { type: T.NVarChar(250), value: b['apellido_titular'] ?? null },
          isexo_titular: { type: T.Char(1), value: b['sexo_titular'] ?? null },
          iestado_civil_titular: { type: T.Char(1), value: b['estado_civil_titular'] ?? null },
          fnac_titular: { type: T.DateTime, value: b['fnac_titular'] ?? null },
          cestado_titular: { type: T.SmallInt, value: this.intField(b['estado_titular']) },
          cciudad_titular: { type: T.SmallInt, value: this.intField(b['ciudad_titular']) },
          xdireccion_titular: { type: T.NVarChar(1000), value: b['direccion_titular'] ?? null },
          xtelefono_titular: { type: T.NVarChar(250), value: b['telefono_titular'] ?? null },
          xcorreo_titular: { type: T.NVarChar(250), value: b['correo_titular'] ?? null },
          cpersona_politica: { type: T.Char(1), value: this.spCharFlag(b['dec_persona_politica']) },
          cterm_y_cod: { type: T.Char(1), value: this.spCharFlag(b['dec_term_y_cod'], '1') },
          cdiagnos_enferm: { type: T.Char(1), value: this.spCharFlag(b['dec_diagnos_enferm']) },
          xdiagnos_enferm: { type: T.NVarChar(250), value: b['dec_descrip_enferm'] ?? null },
          cproductor: {
            type: T.Int,
            value: this.intField(b['productor'] ?? canal['cproductor']) ?? 80080,
          },
          ctipocanal: { type: T.Char(1), value: ctipocanal },
          ccanalalt: { type: T.Int, value: ccanalalt },
          cscanalalt: { type: T.Int, value: cscanalalt },
          ptasamon: { type: T.Numeric(18, 6), value: ptasamonResolved },
          msumaaseg: { type: T.Numeric(18, 2), value: msumaasegResolved },
          cmoneda: {
            type: T.NVarChar(4),
            value: b['cmoneda'] ? String(b['cmoneda']).replace('USD', '$').slice(0, 4) : null,
          },
          mprimaext: { type: T.Numeric(18, 2), value: b['prima'] },
          ifrecuencia: { type: T.Char(1), value: String(b['frecuencia'] ?? 'M').charAt(0) },
          femision: { type: T.DateTime, value: femision },
          fdesde: { type: T.Date, value: fdesde },
          fhasta: { type: T.Date, value: fhasta },
          xcanal_venta: { type: T.NVarChar(250), value: canal['xcanal_venta'] ?? null },
          corigen_rel: { type: T.Char(2), value: canal['corigen_rel'] ?? null },
          api: { type: T.NVarChar(100), value: 'EmissionGeneral' },
          method: { type: T.NVarChar(100), value: 'createEmmisionPersonGeneral' },
          cprog: { type: T.Char(20), value: 'eePoliza_PerGe' },
          ifuente: {
            type: T.Char(10),
            value: String(canal['ifuente_api'] ?? canal['ifuente'] ?? 'API').slice(0, 10),
          },
          fingreso: { type: T.DateTime, value: new Date() },
          cpoliza: { type: T.Numeric(19, 0), value: null },
          cnpoliza: { type: T.VarChar(30), value: null },
          cproces: { type: T.Numeric(13, 0), value: null },
          asegurados: {
            type: T.NVarChar(5000),
            value: this.mapAseguradosForSp(asegurados as Record<string, unknown>[], getPar),
          },
          beneficiarios: {
            type: T.NVarChar(5000),
            value: this.mapBeneficiariosForSp(beneficiarios as Record<string, unknown>[], getPar),
          },
        };

        Object.entries(params).forEach(([key, field]) =>
          req.input(key, (field as { type: unknown }).type, (field as { value: unknown }).value),
        );

        this.logger.log(
          `createEmissionPerson: EXEC sp_pre_emision_Personas_General plan=${b['plan']} rif=${b['rif_titular']}`,
        );

        let spResult: {
          recordset?: Record<string, unknown>[];
          recordsets?: Record<string, unknown>[][];
        };
        try {
          spResult = await req.execute('sp_pre_emision_Personas_General');
        } catch (spErr) {
          const msg = parseSPError(spErr);
          this.logger.error(`createEmissionPerson SP error: ${msg}`);
          throw new BadRequestException(msg);
        }

        let row = this.extractEmissionRow(spResult);
        const rifTitular = this.intField(b['rif_titular']);
        if (!row['cnpoliza'] && rifTitular) {
          this.logger.warn(`createEmissionPerson: SP sin cnpoliza; lookup titular=${rifTitular}`);
          row = await this.lookupEmissionByTitular(rifTitular);
        }

        if (!row['cnpoliza']) {
          this.logger.error(
            `createEmissionPerson: sp_pre_emision sin cnpoliza. recordsets=${spResult.recordsets?.length ?? 0}`,
          );
          throw new InternalServerErrorException(
            'Error al crear la emisión de personas: sp_pre_emision_Personas_General no devolvió cnpoliza.',
          );
        }

        const cnpoliza = String(row['cnpoliza'] ?? '').trim();
        const cnrecibo = String(row['cnrecibo'] ?? '').trim();
        const fanopol = row['fanopol'] as number | undefined;
        const fmespol = row['fmespol'] as number | undefined;
        const ncuota = (row['qcuotas'] ?? row['ncuota']) as number | undefined;

        const pdfBase = (this.config.get<string>('POLICY_PDF_URL') ?? this.config.get<string>('URLPoliza') ?? '').trim().replace(/\/$/, '');
        const urlpoliza = pdfBase && cnpoliza && fanopol != null && fmespol != null
          ? `${pdfBase}/${cnpoliza}/${fanopol}/${fmespol}/`
          : pdfBase && cnpoliza ? `${pdfBase}/${cnpoliza}/` : '';

        this.logger.log(`createEmissionPerson: emitida OK cnpoliza=${cnpoliza}`);
        return { message: 'Emisión registrada exitosamente.', cnpoliza, cnrecibo, urlpoliza, ncuota, fanopol, fmespol };

    } catch (err) {
      if (err instanceof BadRequestException || err instanceof UnauthorizedException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`createEmissionPerson: ${msg}`);
      throw new BadRequestException(msg);
    }
  }
}
