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

      const ins = this.db.request();
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
        ptasamon:              { type: T.Numeric(18, 6), value: b['tasa'] ?? null },
        msumaaseg:             { type: T.Numeric(18, 2), value: b['msumaaseg'] ?? null },
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

      const cols = Object.keys(fields);
      cols.forEach((c) => ins.input(c, (fields[c] as { type: unknown }).type, (fields[c] as { value: unknown }).value));
      const colList = cols.join(', ');
      const valList = cols.map((c) => `@${c}`).join(', ');

      const fieldsLog = Object.keys(fields).reduce((acc, k) => {
        acc[k] = fields[k].value;
        return acc;
      }, {} as Record<string, any>);
      this.logger.log(`createEmissionPerson fields: ${JSON.stringify(fieldsLog)}`);

      this.logger.log(`createEmissionPerson: INSERT eePoliza_Personas_General plan=${b['plan']} rif=${b['rif_titular']}`);

      const insertResult = await ins.query(`
        SET NOCOUNT ON;
        INSERT INTO eePoliza_Personas_General (${colList})
        VALUES (${valList})
      `);

      // El trigger puede devolver múltiples recordsets. Buscamos el que tenga cnpoliza.
      let row: Record<string, any> = {};
      if (insertResult.recordsets && insertResult.recordsets.length > 0) {
        for (const rs of insertResult.recordsets) {
          if (rs && rs.length > 0 && rs[0]['cnpoliza']) {
            row = rs[0];
            break;
          }
        }
      } else if (insertResult.recordset && insertResult.recordset.length > 0) {
        row = insertResult.recordset[0];
      }

      if (Object.keys(row).length === 0) {
        this.logger.error('createEmissionPerson: INSERT no devolvió un recordset válido con cnpoliza. Estructura recibida: ' + JSON.stringify(insertResult));
        throw new InternalServerErrorException(
          'Error al crear la emisión de personas: no se recibió resultado de la vista eePoliza_Personas_General.',
        );
      }

      const cnpoliza = String(row['cnpoliza'] ?? '').trim();
      const cnrecibo = String(row['cnrecibo'] ?? '').trim();
      const fanopol = row['fanopol'] as number | undefined;
      const fmespol = row['fmespol'] as number | undefined;
      const ncuota = (row['qcuotas'] ?? row['ncuota']) as number | undefined;
      if (!cnpoliza || !cnrecibo) {
        this.logger.error(
          `createEmissionPerson: resultado incompleto cnpoliza='${cnpoliza}' cnrecibo='${cnrecibo}'.`,
        );
        throw new InternalServerErrorException(
          'Error al crear la emisión de personas: la emisión no devolvió cnpoliza/cnrecibo.',
        );
      }

      const pdfBase = (this.config.get<string>('POLICY_PDF_URL') ?? this.config.get<string>('URLPoliza') ?? '')
        .trim()
        .replace(/\/$/, '');
      let urlpoliza = '';
      if (pdfBase && cnpoliza) {
        urlpoliza = fanopol != null && fmespol != null
          ? `${pdfBase}/${cnpoliza}/${fanopol}/${fmespol}/`
          : `${pdfBase}/${cnpoliza}/`;
      }

      this.logger.log(`createEmissionPerson: OK cnpoliza=${cnpoliza} cnrecibo=${cnrecibo}`);
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
