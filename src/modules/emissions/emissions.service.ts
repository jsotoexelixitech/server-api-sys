import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';

@Injectable()
export class EmissionsService {
  private readonly logger = new Logger(EmissionsService.name);

  constructor(private readonly db: MssqlService) {}

  // ── Búsqueda de vehículo en vhcerti ──────────────────────────────────────

  private async searchVehicle(field: 'xplaca' | 'xsercar', value: string) {
    const T = this.db.types;
    const req = this.db.request();
    req.input('value', T.VarChar(60), value.trim().toUpperCase());
    const result = await req.query(`
      SELECT TOP 1 *
      FROM vhcerti
      WHERE ${field} = @value
        AND istatcer != 'A'
    `);
    const vehicle = result.recordset ?? [];
    if (vehicle.length === 0) return { status: false };

    const polReq = this.db.request();
    polReq.input('cnpoliza', T.VarChar(20), String(vehicle[0]['cnpoliza'] ?? ''));
    const polResult = await polReq.query(`
      SELECT TOP 1 fhasta, cnpoliza
      FROM adpoliza
      WHERE cnpoliza = @cnpoliza
        AND (iestado != 'N' OR istatpol != 'A')
    `);
    if (polResult.recordset.length > 0) {
      vehicle[0] = { ...vehicle[0], fhasta: polResult.recordset[0]['fhasta'] };
      return {
        status: true,
        message: `El vehículo ya tiene una póliza vigente (${field === 'xplaca' ? 'PLACA' : 'SERIAL DE CARROCERÍA'})`,
        vehicle: vehicle[0],
      };
    }
    return { status: false, vehicle: vehicle[0] };
  }

  // ── POST /api/v1/emissions/automobile/vehicle ─────────────────────────────

  async searchByPlate(xplaca: string) {
    try {
      return await this.searchVehicle('xplaca', xplaca);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchByPlate: ${msg}`);
      throw new InternalServerErrorException('Error al buscar vehículo por placa.');
    }
  }

  // ── POST /api/v1/emissions/automobile/serial ──────────────────────────────

  async searchBySerial(xsercar: string) {
    try {
      return await this.searchVehicle('xsercar', xsercar);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchBySerial: ${msg}`);
      throw new InternalServerErrorException('Error al buscar vehículo por serial.');
    }
  }

  // ── POST /api/v1/external/validateEmissionPerson ─────────────────────────

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
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`validateEmissionPerson (SP validation error): ${msg}`);
      return { status: false, error: msg };
    }
  }

  // ── POST /api/v1/external/validateEmissionAuto ────────────────────────────

  async validateEmissionAuto(body: Record<string, unknown>) {
    const req = this.db.request();
    const T = this.db.types;
    req.input('cplan',   T.VarChar(10), body.plan);
    req.input('xplaca',  T.VarChar(15), body.placa);
    req.input('xsercar', T.VarChar(60), body.serial_carroceria);
    req.input('xsermot', T.VarChar(60), body.serial_motor);
    try {
      await req.execute('speeValidateAutomovilGeneral');
      return { status: true, message: 'Vehículo válido para emisión.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`validateEmissionAuto (SP validation error): ${msg}`);
      return { status: false, error: msg };
    }
  }

  // ── POST /api/v1/external/createEmissionAuto ──────────────────────────────
  //
  // Usa la VIEW `eePoliza_Automovil_General` de Sis2000, que tiene un trigger
  // INSTEAD OF INSERT que ejecuta el SP de emisión, autogenera cnpoliza/cnrecibo
  // y devuelve el resultado como recordset (sin necesitar OUTPUT clause).
  // Este es el mismo mecanismo que usa el backend original de La Mundial (backend-api-sys).

  async createEmissionAuto(apikey: string, body: Record<string, unknown>) {
    try {
      const T = this.db.types;

      // 1. Buscar token en maclient_api para obtener metadatos del canal.
      //    Si no existe, se usan valores por defecto (el token puede ser el
      //    LAMUNDIAL_APIKEY externo que no está registrado localmente).
      const authReq = this.db.request();
      authReq.input('xtoken', T.VarChar(100), apikey);
      const authResult = await authReq.query(`
        SELECT TOP 1 * FROM maclient_api WHERE xtoken = @xtoken
      `);
      const canal: Record<string, unknown> = authResult.recordset.length
        ? authResult.recordset[0]
        : {
            cproductor:   parseInt(process.env.LAMUNDIAL_PRODUCTOR ?? '80080', 10),
            xcanal_venta: 'ExelixiTech-RCV',
            corigen_rel:  'WE',
            ifuente_api:  'API',
            ifuente:      'API',
            cprog:        'eePoliza_AutoGe',
            ctipocanal:   null,
            ccanalalt:    null,
            cscanalalt:   null,
          };

      const b: Record<string, unknown> = { ...body };

      // 1.1 Normalizar fechas y defaults (emision-api puede enviar femision/fdesde/fhasta;
      // si faltan, se calculan desde fecha_emision como en policyService).
      const fechaEmision = String(b['fecha_emision'] ?? b['femision'] ?? '').trim();
      if (fechaEmision) {
        if (!b['femision']) b['femision'] = fechaEmision;
        if (!b['fdesde']) b['fdesde'] = fechaEmision;
        if (!b['fhasta']) {
          const dHasta = new Date(`${fechaEmision}T00:00:00Z`);
          dHasta.setUTCFullYear(dHasta.getUTCFullYear() + 1);
          dHasta.setUTCDate(dHasta.getUTCDate() - 1);
          b['fhasta'] = dHasta.toISOString().slice(0, 10);
        }
      }

      const estadoCivilTom =
        b['iestado_civil_tomador'] ?? b['estado_civil_tomador'];
      if (estadoCivilTom != null && String(estadoCivilTom).trim() !== '') {
        b['iestado_civil_tomador'] = String(estadoCivilTom).trim().charAt(0).toUpperCase();
      } else {
        b['iestado_civil_tomador'] = 'S';
      }

      const estadoCivilTit =
        b['iestado_civil_titular'] ?? b['estado_civil_titular'];
      if (estadoCivilTit != null && String(estadoCivilTit).trim() !== '') {
        b['iestado_civil_titular'] = String(estadoCivilTit).trim().charAt(0).toUpperCase();
      } else {
        b['iestado_civil_titular'] = b['iestado_civil_tomador'];
      }

      if (!b['iplaca'] || String(b['iplaca']).trim() === '') {
        b['iplaca'] = 'N';
      }

      // 1.2 Validaciones de negocio alineadas con QA La Mundial.
      const requiredFields: Array<[string, unknown]> = [
        ['plan', b['cplan'] ?? b['plan']],
        ['fecha_emision', b['fecha_emision'] ?? b['femision']],
        ['fdesde', b['fdesde']],
        ['fhasta', b['fhasta']],
        ['fnac_tomador', b['fnac_tomador']],
        ['cestado_tomador', b['estado_tomador'] ?? b['cestado_tomador']],
        ['cciudad_tomador', b['ciudad_tomador'] ?? b['cciudad_tomador']],
        ['iplaca', b['iplaca']],
        ['iestado_civil_tomador', b['iestado_civil_tomador']],
      ];

      const missing = requiredFields
        .filter(([, value]) => value == null || String(value).trim() === '')
        .map(([name]) => name);

      if (missing.length > 0) {
        throw new BadRequestException(
          `Parámetros de entrada inválidos. Faltan: ${missing.join(', ')}`,
        );
      }

      const isoDate = /^\d{4}-\d{2}-\d{2}$/;
      const dateChecks: Array<[string, unknown]> = [
        ['fecha_emision', b['fecha_emision'] ?? b['femision']],
        ['fdesde', b['fdesde']],
        ['fhasta', b['fhasta']],
        ['fnac_tomador', b['fnac_tomador']],
      ];
      const badDates = dateChecks
        .filter(([, value]) => typeof value !== 'string' || !isoDate.test(value))
        .map(([name]) => name);
      if (badDates.length > 0) {
        throw new BadRequestException(
          `Formato de fecha inválido (YYYY-MM-DD): ${badDates.join(', ')}`,
        );
      }

      // === LLAMADA A LA NUEVA API QAAPISYS2000 (PRIMER INTENTO) ===
      const ENABLE_QAAPISYS2000 = true;
      if (!ENABLE_QAAPISYS2000) {
        throw new Error('qaapisys2000 disabled - usando fallback local directamente');
      }

      const payloadAPI = {
        cramo: b['cramo'] ?? 18,
        plan: String(b['cplan'] ?? b['plan'] ?? '10'),
        tipo_cedula_tomador: String(b['tipo_cedula_tomador'] ?? b['cedula_tomador'] ?? 'V'),
        rif_tomador: Number(b['rif_tomador']),
        nombre_tomador: String(b['nombre_tomador'] ?? ''),
        apellido_tomador: String(b['apellido_tomador'] ?? ''),
        telefono_tomador: String(b['telefono_tomador'] ?? ''),
        correo_tomador: String(b['correo_tomador'] ?? ''),
        fnac_tomador: b['fnac_tomador'] ? String(b['fnac_tomador']) : null,
        isexo_tomador: String(b['sexo_tomador'] ?? b['isexo_tomador'] ?? 'M'),
        iestado_civil_tomador: String(b['estado_civil_tomador'] ?? b['iestado_civil_tomador'] ?? 'S'),
        estado_tomador: Number(b['estado_tomador'] ?? b['cestado_tomador'] ?? 1),
        ciudad_tomador: Number(b['ciudad_tomador'] ?? b['cciudad_tomador'] ?? 128),
        direccion_tomador: String(b['direccion_tomador'] ?? 'No indicada'),
        
        tipo_cedula_titular: String(b['tipo_cedula_titular'] ?? b['cedula_titular'] ?? 'V'),
        rif_titular: Number(b['rif_titular']),
        nombre_titular: String(b['nombre_titular'] ?? ''),
        apellido_titular: String(b['apellido_titular'] ?? ''),
        telefono_titular: String(b['telefono_titular'] ?? ''),
        correo_titular: String(b['correo_titular'] ?? ''),
        fnac_titular: b['fnac_titular'] ? String(b['fnac_titular']) : null,
        isexo_titular: String(b['sexo_titular'] ?? b['isexo_titular'] ?? 'M'),
        iestado_civil_titular: String(b['estado_civil_titular'] ?? b['iestado_civil_titular'] ?? 'S'),
        estado_titular: Number(b['estado_titular'] ?? b['cestado_titular'] ?? 1),
        ciudad_titular: Number(b['ciudad_titular'] ?? b['cciudad_titular'] ?? 128),
        direccion_titular: String(b['direccion_titular'] ?? 'No indicada'),

        cmarca: String(b['cmarca'] ?? b['marca']),
        cmodelo: String(b['cmodelo'] ?? b['modelo']),
        cversion: String(b['cversion'] ?? b['version']),
        cano: Number(b['cano'] ?? b['fano']),
        xcolor: String(b['xcolor'] ?? b['color'] ?? 'No indicado'),
        xplaca: String(b['xplaca'] ?? b['placa']),
        xsercar: String(b['xsercar'] ?? b['serial_carroceria']),
        xsermot: b['xsermot'] ?? b['serial_motor'] ? String(b['xsermot'] ?? b['serial_motor']) : null,

        ccategoria_uso: Number(b['ccategoria_uso'] ?? 20),
        ntoneladas: b['ntoneladas'] != null ? Number(b['ntoneladas']) : null,
        iplaca: String(b['iplaca'] ?? 'N'),
        cusuario: String(b['cusuario'] ?? '4'),

        dec_persona_politica: Number(b['dec_persona_politica'] ?? 0),
        cpersona_politica: Number(b['cpersona_politica'] ?? 0),
        dec_term_y_cod: Number(b['dec_term_y_cod'] ?? 1),
        cterm_y_cod: Number(b['cterm_y_cod'] ?? 1),
        dec_transporte_o_entrega: Number(b['dec_transporte_o_entrega'] ?? 0),

        cproductor: Number(b['productor'] ?? canal['cproductor'] ?? 80080),
        frecuencia: String(b['frecuencia'] ?? b['ifrecuencia'] ?? 'A'),
        mprimaext: Number(b['mprimaext'] ?? b['prima'] ?? b['mprima_ext'] ?? 0),
        
        fecha_emision: fechaEmision,
        fdesde: b['fdesde'] || fechaEmision,
        // Forzamos a que fhasta sea exactamente el mismo día del año siguiente
        fhasta: (() => {
          const d = new Date(`${b['fdesde'] || fechaEmision}T00:00:00Z`);
          d.setUTCFullYear(d.getUTCFullYear() + 1);
          return d.toISOString().slice(0, 10);
        })()
      };

      const EXTERNAL_API_URL = 'https://qaapisys2000.lamundialdeseguros.com/api/v1/external/createEmissionAuto';
      const EXTERNAL_API_KEY = '2729cc160b985890e0e6df72a161aea27f8e45682511c2dfd045f94eb9868f10';
      const EXTERNAL_BASIC_AUTH = 'Basic YWRtaW46cGFzc3dvcmQxMjM0';

      this.logger.log(`=== INICIO EMISION AUTOMOVIL RCV ===`);
      this.logger.log(`1. PAYLOAD RECIBIDO DEL FRONTEND: ${JSON.stringify(b)}`);
      this.logger.log(`2. URL DESTINO API LA MUNDIAL: ${EXTERNAL_API_URL}`);
      this.logger.log(`3. PAYLOAD TRANSFORMADO HACIA LA MUNDIAL: ${JSON.stringify(payloadAPI)}`);
      
      let useFallback = false;
      let resData: any = {};
      let response: Response | null = null;
      let errMsg = 'Error desconocido desde la API';

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
           this.logger.error(`Error llamando API La Mundial Automóvil: ${errMsg}`);
           throw new BadRequestException(errMsg);
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(`Falla de red o timeout comunicando con La Mundial: ${err instanceof Error ? err.message : String(err)}, activando fallback...`);
        useFallback = true;
      }

      if (!useFallback && response?.ok && resData && (resData.status === true || resData.success === true)) {
         this.logger.log(`=== FIN EMISION AUTOMOVIL RCV ===`);
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

      if (useFallback) {
        // === FALLBACK A BASE DE DATOS LOCAL SIS2000 ===
        this.logger.log(`=== INICIO FALLBACK LOCAL EMISION AUTOMOVIL ===`);
        const ins = this.db.request();
        const ctipocanal = null;
        const ccanalalt = null;
        const cscanalalt = null;

        const fields: Record<string, { type: unknown; value: unknown }> = {
          cnpoliza_rel:          { type: T.NVarChar(30),    value: b['cnpoliza_rel'] ?? (b['poliza'] ? `${b['poliza']}` : null) },
          cplan:                 { type: T.NVarChar(10),    value: b['cplan'] ?? b['plan'] },
          icedula_tomador:       { type: T.Char(1),         value: b['tipo_cedula_tomador'] ?? b['cedula_tomador'] },
          xrif_tomador:          { type: T.Numeric(9),      value: b['rif_tomador'] },
          xnombre_tomador:       { type: T.NVarChar(250),   value: b['nombre_tomador'] },
          xapellido_tomador:     { type: T.NVarChar(250),   value: b['apellido_tomador'] },
          isexo_tomador:         { type: T.Char(1),         value: b['sexo_tomador'] ?? b['isexo_tomador'] },
          iestado_civil_tomador: { type: T.Char(1),         value: b['estado_civil_tomador'] ?? null },
          fnac_tomador:          { type: T.Date,            value: b['fnac_tomador'] },
          cestado_tomador:       { type: T.NVarChar(100),   value: b['estado_tomador'] },
          cciudad_tomador:       { type: T.NVarChar(100),   value: b['ciudad_tomador'] },
          xdireccion_tomador:    { type: T.NVarChar(1000),  value: b['direccion_tomador'] },
          xtelefono_tomador:     { type: T.NVarChar(250),   value: b['telefono_tomador'] },
          xcorreo_tomador:       { type: T.NVarChar(250),   value: b['correo_tomador'] },
          icedula_titular:       { type: T.Char(1),         value: b['tipo_cedula_titular'] ?? b['cedula_titular'] },
          xrif_titular:          { type: T.Numeric(9),      value: b['rif_titular'] },
          xnombre_titular:       { type: T.NVarChar(250),   value: b['nombre_titular'] },
          xapellido_titular:     { type: T.NVarChar(250),   value: b['apellido_titular'] },
          isexo_titular:         { type: T.Char(1),         value: b['sexo_titular'] ?? b['isexo_titular'] },
          iestado_civil_titular: { type: T.Char(1),         value: b['estado_civil_titular'] ?? null },
          fnac_titular:          { type: T.DateTime,        value: b['fnac_titular'] ?? null },
          cestado_titular:       { type: T.NVarChar(100),   value: b['estado_titular'] },
          cciudad_titular:       { type: T.NVarChar(100),   value: b['ciudad_titular'] },
          xdireccion_titular:    { type: T.NVarChar(1000),  value: b['direccion_titular'] },
          xtelefono_titular:     { type: T.NVarChar(250),   value: b['telefono_titular'] },
          xcorreo_titular:       { type: T.NVarChar(250),   value: b['correo_titular'] },
          cmarca:                { type: T.Char(3),         value: b['cmarca'] ?? b['marca'] },
          cmodelo:               { type: T.Char(3),         value: b['cmodelo'] ?? b['modelo'] },
          cversion:              { type: T.Char(3),         value: b['cversion'] ?? b['version'] },
          cano:                  { type: T.Int,             value: b['cano'] ?? b['fano'] },
          xcolor:                { type: T.VarChar(60),     value: b['xcolor'] ?? b['color'] },
          xplaca:                { type: T.VarChar(15),     value: b['xplaca'] ?? b['placa'] },
          xsercar:               { type: T.VarChar(60),     value: b['xsercar'] ?? b['serial_carroceria'] },
          xsermot:               { type: T.VarChar(60),     value: b['xsermot'] ?? b['serial_motor'] ?? null },
          cpersona_politica:     { type: T.Int,             value: b['dec_persona_politica'] },
          cterm_y_cod:           { type: T.Int,             value: b['dec_term_y_cod'] },
          ctransporte_o_entrega: { type: T.Int,             value: b['dec_transporte_o_entrega'] ?? null },
          cproductor:            { type: T.Int,             value: b['productor'] ?? 80080 },
          ctipocanal:            { type: T.Char(1),         value: ctipocanal },
          ccanalalt:             { type: T.Int,             value: ccanalalt },
          cscanalalt:            { type: T.Int,             value: cscanalalt },
          ptasamon:              { type: T.Numeric(13, 6),  value: null },
          mprimaext:             { type: T.Numeric(18, 2),  value: b['mprimaext'] ?? b['prima'] ?? b['mprima_ext'] },
          ifrecuencia:           { type: T.Char(1),         value: b['frecuencia'] },
          femision:              { type: T.DateTime,        value: b['fecha_emision'] },
          xcanal_venta:          { type: T.NVarChar(250),   value: null },
          corigen_rel:           { type: T.Char(2),         value: null },
          api:                   { type: T.NVarChar(100),   value: 'createEmissionAutoRCV' },
          method:                { type: T.NVarChar(100),   value: 'POST' },
          cprog:                 { type: T.Char(20),        value: 'eePoliza_AutoGe' },
          ifuente:               { type: T.Char(10),        value: 'API' },
          fingreso:              { type: T.DateTime,        value: new Date() },
          cpoliza:               { type: T.VarChar(19),     value: null },
          cnpoliza:              { type: T.VarChar(30),     value: null },
          cproces:               { type: T.VarChar(13),     value: null },
        };

        const cols = Object.keys(fields);
        cols.forEach((col) => ins.input(col, (fields[col] as any).type, (fields[col] as any).value));

        const colList = cols.join(', ');
        const valList = cols.map((c) => `@${c}`).join(', ');

        this.logger.log(`fallback: INSERT INTO eePoliza_Automovil_General placa=${b['placa']} plan=${b['cplan'] ?? b['plan']}`);

        const insertResult = await ins.query(`
          INSERT INTO eePoliza_Automovil_General (${colList})
          VALUES (${valList})
        `);

        const row = insertResult.recordset?.[0] ?? {};
        const cnpoliza  = String(row['cnpoliza']  ?? '').trim();
        const cnrecibo  = String(row['cnrecibo']  ?? '').trim();
        const fanopol   = row['fanopol']  as number | undefined;
        const fmespol   = row['fmespol']  as number | undefined;
        const ncuota    = (row['qcuotas'] ?? row['ncuota']) as number | undefined;

        const pdfBase   = (process.env.POLICY_PDF_URL ?? 'https://qaapi.lamundialdeseguros.com/sis2000/poliza/').replace(/\/$/, '');
        const urlpoliza = cnpoliza && fanopol != null && fmespol != null
          ? `${pdfBase}/${cnpoliza}/${fanopol}/${fmespol}/`
          : '';

        this.logger.log(`fallback OK cnpoliza=${cnpoliza} cnrecibo=${cnrecibo}`);
        this.logger.log(`=== FIN FALLBACK LOCAL EMISION AUTOMOVIL ===`);

        return {
          message: 'Emisión registrada exitosamente via Fallback Local.',
          cnpoliza,
          cnrecibo,
          urlpoliza,
          ncuota,
          fanopol,
          fmespol,
        };
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (
        lower.includes('poliza vigente') ||
        lower.includes('póliza vigente') ||
        lower.includes('serial carrocer')
      ) {
        throw new BadRequestException(msg);
      }
      this.logger.error(`createEmissionAuto: ${msg}`);
      throw new InternalServerErrorException(`Error al crear emisión: ${msg}`);
    }
  }
}
