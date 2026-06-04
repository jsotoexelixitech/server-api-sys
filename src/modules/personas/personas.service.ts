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

@Injectable()
export class PersonasService {
  private readonly logger = new Logger(PersonasService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

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

  // ── Planes de personas (maplanes_per, ramo 9 + lista blanca) ───────────────

  async getPlanesPer(cramo?: number, _ctipo?: number | null): Promise<PlanPerItem[]> {
    try {
      const T = this.db.types;
      const ramo = cramo ?? this.defaultRamo;

      // Los planes de personas viven en la tabla MAPLANES_PER (no en spBuscaPlan,
      // que es para auto/general). Réplica parametrizada del getPlanesPer legacy.
      const mapRows = (rs: Record<string, unknown>[]): PlanPerItem[] =>
        rs
          .map((p) => ({
            cplan: String(p['cplan'] ?? '').trim(),
            xplan: String(p['xplan'] ?? '').trim(),
            cramo: Number(p['cramo'] ?? ramo),
            cmoneda: String(p['cmoneda'] ?? '').trim() || undefined,
          }))
          .filter((p) => p.cplan);

      const codes = this.funeralPlanCodes;
      const req = this.db.request();
      req.input('cramo', T.Int, ramo);
      let whereClause = `iestado = 'V' AND cramo = @cramo`;
      if (codes.length > 0) {
        codes.forEach((c, i) => req.input(`pl${i}`, T.VarChar(10), c));
        whereClause += ` AND TRIM(cplan) IN (${codes.map((_, i) => `@pl${i}`).join(', ')})`;
      }
      const result = await req.query<Record<string, unknown>>(`
        SELECT TRIM(cplan) AS cplan, TRIM(xplan) AS xplan, cramo, TRIM(cmoneda) AS cmoneda
        FROM maplanes_per
        WHERE ${whereClause}
      `);

      let planes = mapRows((result.recordset ?? []) as Record<string, unknown>[]);

      // Fallback: si la lista blanca no trae filas, devuelve todos los planes del
      // ramo (comportamiento previo) para no quedar vacío.
      if (planes.length === 0) {
        this.logger.warn(`getPlanesPer: sin planes para cramo=${ramo} codes=[${codes.join(',')}]; usando todos los vigentes del ramo.`);
        const allReq = this.db.request();
        allReq.input('cramo', T.Int, ramo);
        const allResult = await allReq.query<Record<string, unknown>>(`
          SELECT TRIM(cplan) AS cplan, TRIM(xplan) AS xplan, cramo, TRIM(cmoneda) AS cmoneda
          FROM maplanes_per
          WHERE iestado = 'V' AND cramo = @cramo
        `);
        planes = mapRows((allResult.recordset ?? []) as Record<string, unknown>[]);
      }

      return await this.enrichWithParentescos(planes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getPlanesPer: ${msg}`);
      throw new InternalServerErrorException('Error al obtener los planes de personas.');
    }
  }

  private async enrichWithParentescos(planes: PlanPerItem[]): Promise<PlanPerItem[]> {
    const T = this.db.types;
    for (const plan of planes) {
      try {
        const req = this.db.request();
        req.input('cramo', T.NVarChar(20), String(plan.cramo));
        req.input('cplan', T.NVarChar(20), plan.cplan);
        const result = await req.query<{ cparen: number; xparentesco: string; min_edad: number; max_edad: number }>(`
          SELECT
            A.cparen,
            TRIM(B.xparentesco) AS xparentesco,
            C.cemin_ase         AS min_edad,
            C.cemax_ase         AS max_edad
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
        this.logger.error(`enrichWithParentescos plan=${plan.cplan}: ${msg}`);
        plan.parentescos = [];
      }
    }
    return planes;
  }

  async getParenPlanPer(cramo: number, cplan: string) {
    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('cramo', T.NVarChar(20), String(cramo));
      req.input('cplan', T.NVarChar(20), cplan);
      const result = await req.query<{ cparen: number; xparentesco: string }>(`
        SELECT
          A.cparen,
          TRIM(B.xparentesco) AS xparentesco
        FROM mapltarifas_per A
        INNER JOIN maparent B ON B.cparentesco = A.cparen
        WHERE A.cramo = @cramo AND A.cplan = @cplan
        GROUP BY A.cparen, B.xparentesco
      `);
      return result.recordset ?? [];
    } catch (err) {
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

      // Tasa de cambio: usa la enviada o la lee de mamonedas ('$').
      let ptasamon = body.ptasamon ?? 0;
      if (!ptasamon) {
        const rateReq = this.db.request();
        const rateResult = await rateReq.query<{ ptasamon: number }>(
          `SELECT ptasamon FROM mamonedas WHERE TRIM(cmoneda) = '$'`,
        );
        ptasamon = rateResult.recordset[0]?.ptasamon ?? 0;
      }
      if (!ptasamon) this.logger.warn('getCotizacionPer: ptasamon = 0 (verificar mamonedas)');

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
      const ptasa = mprimaext > 0 ? parseFloat((mprima / mprimaext).toFixed(4)) : ptasamon;

      this.logger.log(
        `getCotizacionPer: plan=${body.cplan} asegurados=${body.asegurados.length} mprimaext=$${mprimaext} mprima=Bs${mprima}`,
      );

      return { mprima, mprimaext, ptasa };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getCotizacionPer: ${msg}`);
      throw new InternalServerErrorException('Error al calcular la cotización de personas.');
    }
  }

  // ── Emisión de póliza de personas (vista eePoliza_Personas_General) ────────

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

      // 1. Canal emisor (maclient_api). Si el token no existe, usa defaults.
      const authReq = this.db.request();
      authReq.input('xtoken', T.VarChar(100), apikey);
      const authResult = await authReq.query(
        `SELECT TOP 1 * FROM maclient_api WHERE xtoken = @xtoken`,
      );
      if (authResult.recordset.length === 0 && !apikey) {
        throw new UnauthorizedException('Fallo de autenticación: token no encontrado.');
      }
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

      // 2a. Tasa de cambio: si no viene en el body, leerla de mamonedas.
      let ptasamonResolved = (b['tasa'] != null ? Number(b['tasa']) : null);
      if (!ptasamonResolved) {
        const rateReq = this.db.request();
        const rateResult = await rateReq.query<{ ptasamon: number }>(
          `SELECT ptasamon FROM mamonedas WHERE TRIM(cmoneda) = '$'`,
        );
        ptasamonResolved = rateResult.recordset[0]?.ptasamon ?? null;
        if (ptasamonResolved) this.logger.log(`createEmissionPerson: ptasamon auto-resuelto = ${ptasamonResolved}`);
      }

      // 2b. Suma asegurada: si no viene en el body, obtenerla de spCalculoPer
      //     usando el primer asegurado. El trigger NECESITA este valor para calcular
      //     la prima por cobertura y no sufrir overflow en la conversión de moneda.
      let msumaasegResolved = (b['msumaaseg'] != null ? Number(b['msumaaseg']) : null);
      if (!msumaasegResolved) {
        const aseguradosList = Array.isArray(b['asegurados'])
          ? b['asegurados'] as Record<string, any>[]
          : (b['funeral'] && typeof b['funeral'] === 'object' && Array.isArray((b['funeral'] as any)['asegurados'])
            ? (b['funeral'] as any)['asegurados'] as Record<string, any>[]
            : []);

        if (aseguradosList.length > 0) {
          const ase = aseguradosList[0] as Record<string, any>;
          const fnacStr = String(ase.fnac_asegurado ?? ase.fechaNac ?? '');
          const birthDate = fnacStr ? new Date(fnacStr) : null;
          const nedad = birthDate
            ? Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 3600 * 1000))
            : 30;
          try {
            const calReq = this.db.request();
            calReq.input('ptasamon', T.Numeric(13, 6), ptasamonResolved ?? 0);
            calReq.input('cramo', T.Int, Number(b['cramo'] ?? 9));
            calReq.input('cplan', T.VarChar(10), String(b['plan'] ?? ''));
            calReq.input('cparen', T.Int, 1); // Titular
            calReq.input('xrif_asegurado', T.VarChar(10), String(ase.xrif_asegurado ?? ase.identificacion ?? '').replace(/\D/g, ''));
            calReq.input('nedad_asegurado', T.Int, nedad);
            calReq.input('ifrecuencia', T.Char(1), String(b['frecuencia'] ?? 'M'));
            calReq.input('msumaaseg', T.Numeric(18, 2), null);
            const calResult = await calReq.execute('spCalculoPer');
            const calRow = (calResult.recordsets?.[0] ?? []) as Record<string, any>[];
            if (calRow.length > 0 && calRow[0]['msumaasegext']) {
              msumaasegResolved = Number(calRow[0]['msumaasegext']);
              this.logger.log(`createEmissionPerson: msumaaseg auto-resuelto = ${msumaasegResolved} USD`);
            }
          } catch (calErr) {
            this.logger.warn(`createEmissionPerson: no se pudo auto-resolver msumaaseg: ${calErr instanceof Error ? calErr.message : calErr}`);
          }
        }
      }

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

      const ctipocanal = (b['ctipocanal'] ?? (canal['ctipocanal'] === 'A' ? canal['ctipocanal'] : null)) as string | null;
      const ccanalalt = (b['ccanalalt'] ?? (canal['ctipocanal'] === 'A' ? canal['ccanalalt'] : null)) as number | null;
      const cscanalalt = (b['cscanalalt'] ?? (canal['ctipocanal'] === 'A' ? canal['cscanalalt'] : null)) as number | null;

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
      const ENABLE_QAAPISYS2000 = false; // <-- APAGADO TEMPORALMENTE por bug en rollback de la API externa
      try {
        if (!ENABLE_QAAPISYS2000) {
          throw new Error('qaapisys2000 disabled - usando fallback local directamente');
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

        const EXTERNAL_API_URL = 'https://qaapisys2000.lamundialdeseguros.com/api/v1/external/createEmissionPerson';
        const EXTERNAL_API_KEY = '2729cc160b985890e0e6df72a161aea27f8e45682511c2dfd045f94eb9868f10';
        const EXTERNAL_BASIC_AUTH = 'Basic YWRtaW46cGFzc3dvcmQxMjM0';

        this.logger.log(`Llamando API externa La Mundial con payload: ${JSON.stringify(payloadAPI)}`);
        
        const response = await fetch(EXTERNAL_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EXTERNAL_API_KEY,
            'Authorization': EXTERNAL_BASIC_AUTH
          },
          body: JSON.stringify(payloadAPI)
        });
        
        const resData = await response.json().catch(() => ({}));
        this.logger.log(`Respuesta API La Mundial: HTTP ${response.status} - ${JSON.stringify(resData)}`);

        // De acuerdo con la API, status === true significa éxito, pero si hay error HTTP ya no pasa
        if (response.ok && resData && resData.status === true) {
           return {
             message: 'Emisión registrada exitosamente via API La Mundial.',
             cnpoliza: resData.poliza || resData.cnpoliza || '',
             cnrecibo: resData.recibo || resData.cnrecibo || '',
             urlpoliza: '',
             ncuota: 1,
             fanopol: new Date().getFullYear(),
             fmespol: new Date().getMonth() + 1
           };
        }
        
        this.logger.warn(`API La Mundial falló o fue rechazada. Usando fallback local...`);
      } catch (apiErr) {
        this.logger.error(`Error llamando API La Mundial: ${apiErr instanceof Error ? apiErr.message : String(apiErr)}. Usando fallback.`);
      }
      // === FIN LLAMADA API LA MUNDIAL ===

      const fields: Record<string, { type: unknown; value: unknown }> = {
        cnpoliza_rel:          { type: T.NVarChar(30),   value: b['poliza'] ? String(b['poliza']) : null },
        cramo:                 { type: T.Int,            value: b['cramo'] },
        cplan:                 { type: T.NVarChar(10),   value: b['plan'] },
        icedula_tomador:       { type: T.Char(1),        value: b['tipo_cedula_tomador'] ?? b['cedula_tomador'] },
        xrif_tomador:          { type: T.Numeric(9),     value: b['rif_tomador'] },
        xnombre_tomador:       { type: T.NVarChar(250),  value: b['nombre_tomador'] },
        xapellido_tomador:     { type: T.NVarChar(250),  value: b['apellido_tomador'] },
        isexo_tomador:         { type: T.Char(1),        value: b['sexo_tomador'] },
        iestado_civil_tomador: { type: T.Char(1),        value: b['estado_civil_tomador'] },
        fnac_tomador:          { type: T.Date,           value: b['fnac_tomador'] },
        cestado_tomador:       { type: T.NVarChar(100),  value: b['estado_tomador'] != null ? String(b['estado_tomador']) : null },
        cciudad_tomador:       { type: T.NVarChar(100),  value: b['ciudad_tomador'] != null ? String(b['ciudad_tomador']) : null },
        xdireccion_tomador:    { type: T.NVarChar(1000), value: b['direccion_tomador'] },
        xtelefono_tomador:     { type: T.NVarChar(250),  value: b['telefono_tomador'] },
        xcorreo_tomador:       { type: T.NVarChar(250),  value: b['correo_tomador'] },
        icedula_titular:       { type: T.Char(1),        value: b['tipo_cedula_titular'] ?? b['cedula_titular'] },
        xrif_titular:          { type: T.Numeric(9),     value: b['rif_titular'] },
        xnombre_titular:       { type: T.NVarChar(250),  value: b['nombre_titular'] },
        xapellido_titular:     { type: T.NVarChar(250),  value: b['apellido_titular'] },
        isexo_titular:         { type: T.Char(1),        value: b['sexo_titular'] },
        iestado_civil_titular: { type: T.Char(1),        value: b['estado_civil_titular'] },
        fnac_titular:          { type: T.DateTime,       value: b['fnac_titular'] },
        cestado_titular:       { type: T.NVarChar(100),  value: b['estado_titular'] != null ? String(b['estado_titular']) : null },
        cciudad_titular:       { type: T.NVarChar(100),  value: b['ciudad_titular'] != null ? String(b['ciudad_titular']) : null },
        xdireccion_titular:    { type: T.NVarChar(1000), value: b['direccion_titular'] },
        xtelefono_titular:     { type: T.NVarChar(250),  value: b['telefono_titular'] },
        xcorreo_titular:       { type: T.NVarChar(250),  value: b['correo_titular'] },
        cpersona_politica:     { type: T.Int,            value: b['dec_persona_politica'] ?? null },
        cterm_y_cod:           { type: T.Int,            value: b['dec_term_y_cod'] ?? null },
        cdiagnos_enferm:       { type: T.Int,            value: b['dec_diagnos_enferm'] ?? null },
        xdiagnos_enferm:       { type: T.NVarChar(250),  value: b['dec_descrip_enferm'] ?? null },
        cproductor:            { type: T.Int,            value: b['productor'] ?? canal['cproductor'] },
        ctipocanal:            { type: T.Char(1),        value: ctipocanal },
        ccanalalt:             { type: T.Int,            value: ccanalalt },
        cscanalalt:            { type: T.Int,            value: cscanalalt },
        ptasamon:              { type: T.Numeric(18, 6), value: ptasamonResolved },
        msumaaseg:             { type: T.Numeric(18, 2), value: msumaasegResolved },
        cmoneda:               { type: T.NVarChar(6),    value: b['cmoneda'] ?? null },
        mprimaext:             { type: T.Numeric(18, 2), value: b['prima'] },
        ifrecuencia:           { type: T.Char(1),        value: b['frecuencia'] },
        femision:              { type: T.DateTime,       value: femision },
        fdesde:                { type: T.Date,           value: fdesde },
        fhasta:                { type: T.Date,           value: fhasta },
        xcanal_venta:          { type: T.NVarChar(250),  value: canal['xcanal_venta'] ?? null },
        corigen_rel:           { type: T.Char(2),        value: canal['corigen_rel'] ?? null },
        api:                   { type: T.NVarChar(100),  value: 'EmissionGeneral' },
        method:                { type: T.NVarChar(100),  value: 'createEmmisionPersonGeneral' },
        cprog:                 { type: T.Char(20),       value: 'eePoliza_PerGe' },
        ifuente:               { type: T.Char(10),       value: canal['ifuente_api'] ?? canal['ifuente'] ?? 'API' },
        fingreso:              { type: T.DateTime,       value: new Date() },
        cpoliza:               { type: T.Numeric(19, 0), value: null },
        cnpoliza:              { type: T.VarChar(30),    value: null },
        cproces:               { type: T.Numeric(13, 0), value: null },
      };

      const colList = Object.keys(fields).join(', ');
      const valList = Object.keys(fields).map((c) => `@${c}`).join(', ');

      this.logger.log(`_createEmissionPerson: asegurados count = ${asegurados.length}`);

      // IMPORTANTE: Limpiar tablas de staging por el problema de concurrencia viejo (además del Mutex)
      await this.db.request().query('DELETE FROM eePoliza_Salud_Aseg');
      await this.db.request().query('DELETE FROM eePoliza_Salud_Ben');

      // 4. Insertar asegurados en tabla temporal (misma conexión del pool)
      for (const a of asegurados as Record<string, any>[]) {
        const reqAseg = this.db.request();
        reqAseg.input('icedula_asegurado', T.Char(1), a.icedula_asegurado ?? a.tipoDoc ?? 'V');
        reqAseg.input('xrif_asegurado', T.Numeric(13, 0), a.xrif_asegurado ?? a.identificacion);
        reqAseg.input('xnombre_asegurado', T.NVarChar(120), a.xnombre_asegurado ?? a.nombre);
        reqAseg.input('xapellido_asegurado', T.NVarChar(120), a.xapellido_asegurado ?? a.apellido);
        reqAseg.input('fnac_asegurado', T.DateTime, a.fnac_asegurado ?? a.fechaNac);
        reqAseg.input('isexo_asegurado', T.Char(1), a.isexo_asegurado ?? (a.sexo ? String(a.sexo)[0].toUpperCase() : 'M'));
        reqAseg.input('nparentesco_asegurado', T.Int, getPar(a.nparentesco_asegurado ?? a.parentesco));
        reqAseg.input('iestado_civil_asegurado', T.Char(1), a.iestado_civil_asegurado ?? 'S');
        await reqAseg.query(`
          INSERT INTO eePoliza_Salud_Aseg (
            icedula_asegurado, xrif_asegurado, xnombre_asegurado, xapellido_asegurado,
            fnac_asegurado, isexo_asegurado, nparentesco_asegurado, iestado_civil_asegurado
          ) VALUES (
            @icedula_asegurado, @xrif_asegurado, @xnombre_asegurado, @xapellido_asegurado,
            @fnac_asegurado, @isexo_asegurado, @nparentesco_asegurado, @iestado_civil_asegurado
          )
        `);
      }

      for (const a of beneficiarios as Record<string, any>[]) {
        const reqBen = this.db.request();
        reqBen.input('icedula_beneficiario', T.Char(1), a.icedula_beneficiario ?? a.tipoDoc ?? 'V');
        reqBen.input('xrif_beneficiario', T.Numeric(13, 0), a.xrif_beneficiario ?? a.identificacion);
        reqBen.input('xnombre_beneficiario', T.NVarChar(120), a.xnombre_beneficiario ?? a.nombre);
        reqBen.input('xapellido_beneficiario', T.NVarChar(120), a.xapellido_beneficiario ?? a.apellido);
        reqBen.input('fnac_beneficiario', T.DateTime, a.fnac_beneficiario ?? a.fechaNac);
        reqBen.input('isexo_beneficiario', T.Char(1), a.isexo_beneficiario ?? (a.sexo ? String(a.sexo)[0].toUpperCase() : 'M'));
        reqBen.input('nparentesco_beneficiario', T.Int, getPar(a.nparentesco_beneficiario ?? a.parentesco));
        await reqBen.query(`
          INSERT INTO eePoliza_Salud_Ben (
            icedula_beneficiario, xrif_beneficiario, xnombre_beneficiario, xapellido_beneficiario,
            fnac_beneficiario, isexo_beneficiario, nparentesco_beneficiario
          ) VALUES (
            @icedula_beneficiario, @xrif_beneficiario, @xnombre_beneficiario, @xapellido_beneficiario,
            @fnac_beneficiario, @isexo_beneficiario, @nparentesco_beneficiario
          )
        `);
      }

      const fieldsLog = Object.keys(fields).reduce((acc, k) => { acc[k] = fields[k].value; return acc; }, {} as Record<string, any>);
      this.logger.log(`createEmissionPerson fields: ${JSON.stringify(fieldsLog)}`);
      this.logger.log(`createEmissionPerson: INSERT eePoliza_Personas_General plan=${b['plan']} rif=${b['rif_titular']}`);

      // 5. INSERT principal — el trigger eePoliza_Personas_General lee las tablas temporales
      const reqInsert = this.db.request();
      Object.keys(fields).forEach((c) => reqInsert.input(c, (fields[c] as { type: any }).type, (fields[c] as { value: unknown }).value));

      const insertResult = await reqInsert.query(`
        INSERT INTO eePoliza_Personas_General (${colList})
        VALUES (${valList})
      `);

      // El trigger devuelve el resultado en recordset[0]
      let row: Record<string, any> = {};
      if (insertResult.recordsets && insertResult.recordsets.length > 0) {
        for (const rs of insertResult.recordsets) {
          if (rs && rs.length > 0 && rs[0]['cnpoliza']) {
            row = rs[0];
            break;
          }
        }
      }
      if (Object.keys(row).length === 0 && insertResult.recordset && insertResult.recordset.length > 0) {
        row = insertResult.recordset[0];
      }

      this.logger.log(`createEmissionPerson: insertResult = ${JSON.stringify(insertResult)}`);

      if (Object.keys(row).length === 0 || !row['cnpoliza']) {
        this.logger.error('createEmissionPerson: INSERT no devolvió cnpoliza. Estructura: ' + JSON.stringify(insertResult));
        throw new InternalServerErrorException(
          'Error al crear la emisión de personas: no se recibió resultado de la vista eePoliza_Personas_General.',
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
      const lower = msg.toLowerCase();
      if (lower.includes('poliza vigente') || lower.includes('póliza vigente') || lower.includes('mismo asegurado')) {
        throw new BadRequestException(msg);
      }
      this.logger.error(`createEmissionPerson: ${msg}`);
      throw new InternalServerErrorException(`Error al crear la emisión de personas: ${msg}`);
    }
  }
}
