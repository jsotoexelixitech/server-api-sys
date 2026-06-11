import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';

@Injectable()
export class EmissionsService {
  private readonly logger = new Logger(EmissionsService.name);

  constructor(private readonly db: MssqlService) {}

  // ÔöÇÔöÇ B├║squeda de veh├¡culo en vhcerti ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

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
        message: `El veh├¡culo ya tiene una p├│liza vigente (${field === 'xplaca' ? 'PLACA' : 'SERIAL DE CARROCER├ìA'})`,
        vehicle: vehicle[0],
      };
    }
    return { status: false, vehicle: vehicle[0] };
  }

  // ÔöÇÔöÇ POST /api/v1/emissions/automobile/vehicle ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

  async searchByPlate(xplaca: string) {
    try {
      return await this.searchVehicle('xplaca', xplaca);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchByPlate: ${msg}`);
      throw new InternalServerErrorException('Error al buscar veh├¡culo por placa.');
    }
  }

  // ÔöÇÔöÇ POST /api/v1/emissions/automobile/serial ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

  async searchBySerial(xsercar: string) {
    try {
      return await this.searchVehicle('xsercar', xsercar);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchBySerial: ${msg}`);
      throw new InternalServerErrorException('Error al buscar veh├¡culo por serial.');
    }
  }

  // ÔöÇÔöÇ POST /api/v1/external/validateEmissionPerson ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

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
      return { status: true, message: 'Persona v├ílida para emisi├│n.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`validateEmissionPerson (SP validation error): ${msg}`);
      return { status: false, error: msg };
    }
  }

  // ÔöÇÔöÇ POST /api/v1/external/validateEmissionAuto ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

  async validateEmissionAuto(body: Record<string, unknown>) {
    const req = this.db.request();
    const T = this.db.types;
    req.input('cplan',   T.VarChar(10), body.plan);
    req.input('xplaca',  T.VarChar(15), body.placa);
    req.input('xsercar', T.VarChar(60), body.serial_carroceria);
    req.input('xsermot', T.VarChar(60), body.serial_motor);
    try {
      await req.execute('speeValidateAutomovilGeneral');
      return { status: true, message: 'Veh├¡culo v├ílido para emisi├│n.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`validateEmissionAuto (SP validation error): ${msg}`);
      return { status: false, error: msg };
    }
  }

  // ÔöÇÔöÇ POST /api/v1/external/createEmissionAuto ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  //
  // Usa la VIEW `eePoliza_Automovil_General` de Sis2000, que tiene un trigger
  // INSTEAD OF INSERT que ejecuta el SP de emisi├│n, autogenera cnpoliza/cnrecibo
  // y devuelve el resultado como recordset (sin necesitar OUTPUT clause).
  // Este es el mismo mecanismo que usa el backend original de La Mundial (backend-api-sys).

  async createEmissionAuto(apikey: string, body: Record<string, unknown>) {
    try {
      const T = this.db.types;

      // 1. Autenticar token contra maclient_api
      const authReq = this.db.request();
      authReq.input('xtoken', T.VarChar(100), apikey);
      const authResult = await authReq.query(`
        SELECT TOP 1 * FROM maclient_api WHERE xtoken = @xtoken
      `);
      if (!authResult.recordset.length) {
        throw new UnauthorizedException('Token no encontrado.');
      }
      const canal = authResult.recordset[0];

      const b = body;

      // 2. Si el canal es de tipo 'A', tomar datos del canal del token
      const ctipocanal = (b['ctipocanal'] ?? (canal['ctipocanal'] === 'A' ? canal['ctipocanal'] : null)) as string | null;
      const ccanalalt  = (b['ccanalalt']  ?? (canal['ctipocanal'] === 'A' ? canal['ccanalalt']  : null)) as number | null;
      const cscanalalt = (b['cscanalalt'] ?? (canal['ctipocanal'] === 'A' ? canal['cscanalalt'] : null)) as number | null;

      // 3. INSERT en eePoliza_Automovil_General (VIEW con trigger INSTEAD OF INSERT)
      //    Misma estructura que createEmmisionAutomobileGeneric en el backend original.
      //    NO se usa OUTPUT clause ÔÇö el trigger devuelve el resultado como recordset.
      const ins = this.db.request();

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
        cproductor:            { type: T.Int,             value: b['productor'] ?? canal['cproductor'] },
        ctipocanal:            { type: T.Char(1),         value: ctipocanal },
        ccanalalt:             { type: T.Int,             value: ccanalalt },
        cscanalalt:            { type: T.Int,             value: cscanalalt },
        ptasamon:              { type: T.Numeric(13, 6),  value: null },
        // mprimaext = monto en divisas (USD); en el original se llama 'prima' en el body
        mprimaext:             { type: T.Numeric(18, 2),  value: b['mprimaext'] ?? b['prima'] ?? b['mprima_ext'] },
        ifrecuencia:           { type: T.Char(1),         value: b['frecuencia'] },
        femision:              { type: T.DateTime,        value: b['fecha_emision'] },
        xcanal_venta:          { type: T.NVarChar(250),   value: canal['xcanal_venta'] ?? null },
        corigen_rel:           { type: T.Char(2),         value: canal['corigen_rel'] ?? null },
        api:                   { type: T.NVarChar(100),   value: 'createEmissionAutoRCV' },
        method:                { type: T.NVarChar(100),   value: 'POST' },
        cprog:                 { type: T.Char(20),        value: canal['cprog'] ?? 'eePoliza_AutoGe' },
        ifuente:               { type: T.Char(10),        value: canal['ifuente_api'] ?? canal['ifuente'] ?? 'API' },
        fingreso:              { type: T.DateTime,        value: new Date() },
        cpoliza:               { type: T.VarChar(19),     value: null },
        cnpoliza:              { type: T.VarChar(30),     value: null },
        cproces:               { type: T.VarChar(13),     value: null },
      };

      const cols = Object.keys(fields);
      cols.forEach((col) => ins.input(col, (fields[col] as any).type, (fields[col] as any).value));

      const colList = cols.join(', ');
      const valList = cols.map((c) => `@${c}`).join(', ');

      this.logger.log(`createEmissionAuto: INSERT INTO eePoliza_Automovil_General placa=${b['placa']} plan=${b['cplan'] ?? b['plan']}`);

      // Sin OUTPUT clause: el trigger INSTEAD OF INSERT de la VIEW retorna el recordset
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

      const pdfBase   = (process.env.POLICY_PDF_URL ?? '').replace(/\/$/, '');
      const urlpoliza = cnpoliza && fanopol != null && fmespol != null
        ? `${pdfBase}/${cnpoliza}/${fanopol}/${fmespol}/`
        : '';

      this.logger.log(`createEmissionAuto: OK cnpoliza=${cnpoliza} cnrecibo=${cnrecibo}`);

      return {
        message: 'Emisi├│n registrada exitosamente.',
        cnpoliza,
        cnrecibo,
        urlpoliza,
        ncuota,
        fanopol,
        fmespol,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`createEmissionAuto: ${msg}`);
      throw new InternalServerErrorException(`Error al crear emisi├│n: ${msg}`);
    }
  }
}
