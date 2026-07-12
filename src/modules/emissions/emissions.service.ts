import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { parseSPError } from '../../common/helpers/sp-error.helper';

@Injectable()
export class EmissionsService {
  private readonly logger = new Logger(EmissionsService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  private nvarchar(value: unknown): string | null {
    if (value == null || String(value).trim() === '') return null;
    return String(value);
  }

  /** Resuelve clave interna o La Mundial (ej. estado_tomador / cestado_tomador). */
  private pick<T>(b: Record<string, unknown>, ...keys: string[]): T | undefined {
    for (const key of keys) {
      const v = b[key];
      if (v != null && String(v).trim() !== '') return v as T;
    }
    return undefined;
  }

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

  async searchByPlate(xplaca: string) {
    try {
      return await this.searchVehicle('xplaca', xplaca);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchByPlate: ${msg}`);
      throw new InternalServerErrorException('Error al buscar vehículo por placa.');
    }
  }

  async searchBySerial(xsercar: string) {
    try {
      return await this.searchVehicle('xsercar', xsercar);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchBySerial: ${msg}`);
      throw new InternalServerErrorException('Error al buscar vehículo por serial.');
    }
  }

  async validateEmissionAuto(body: Record<string, unknown>) {
    const req = this.db.request();
    const T = this.db.types;
    req.input('cplan', T.VarChar(10), body.plan);
    req.input('xplaca', T.VarChar(15), body.placa);
    req.input('xsercar', T.VarChar(60), body.serial_carroceria);
    req.input('xsermot', T.VarChar(60), body.serial_motor);
    try {
      await req.execute('speeValidateAutomovilGeneral');
      return { status: true, message: 'Vehículo válido para emisión.' };
    } catch (err) {
      const msg = parseSPError(err);
      this.logger.warn(`validateEmissionAuto (SP validation error): ${msg}`);
      return { status: false, error: msg };
    }
  }

  async createEmissionAuto(apikey: string, body: Record<string, unknown>) {
    try {
      const T = this.db.types;
      const authReq = this.db.request();
      authReq.input('xtoken', T.VarChar(100), apikey);
      const authResult = await authReq.query(`
        SELECT TOP 1 * FROM maclient_api WHERE xtoken = @xtoken
      `);
      const canal: Record<string, unknown> = authResult.recordset.length
        ? authResult.recordset[0]
        : {
            cproductor: parseInt(this.config.get<string>('LAMUNDIAL_PRODUCTOR', '80080') ?? '80080', 10),
            xcanal_venta: 'ExelixiTech-RCV',
            corigen_rel: 'WE',
            ifuente_api: 'API',
            ifuente: 'API',
            cprog: 'eePoliza_AutoGe',
            ctipocanal: null,
            ccanalalt: null,
            cscanalalt: null,
          };

      const b: Record<string, unknown> = { ...body };
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

      const estadoCivilTom = b['iestado_civil_tomador'] ?? b['estado_civil_tomador'];
      b['iestado_civil_tomador'] =
        estadoCivilTom != null && String(estadoCivilTom).trim() !== ''
          ? String(estadoCivilTom).trim().charAt(0).toUpperCase()
          : 'S';

      const estadoCivilTit = b['iestado_civil_titular'] ?? b['estado_civil_titular'];
      b['iestado_civil_titular'] =
        estadoCivilTit != null && String(estadoCivilTit).trim() !== ''
          ? String(estadoCivilTit).trim().charAt(0).toUpperCase()
          : b['iestado_civil_tomador'];

      const tipoPlaca =
        b['iplaca'] ?? b['tipo_placa'] ?? (b['xplaca'] || b['placa'] ? 'N' : null);
      if (tipoPlaca != null && String(tipoPlaca).trim() !== '') {
        b['iplaca'] = String(tipoPlaca).trim().charAt(0).toUpperCase();
      } else {
        b['iplaca'] = 'N';
      }

      if (!b['xplaca'] && b['placa']) b['xplaca'] = b['placa'];
      if (!b['xsercar'] && b['serial_carroceria']) b['xsercar'] = b['serial_carroceria'];
      if (!b['xsermot'] && b['serial_motor']) b['xsermot'] = b['serial_motor'];

      const requiredFields: Array<[string, unknown]> = [
        ['plan', b['cplan'] ?? b['plan']],
        ['fecha_emision', b['fecha_emision'] ?? b['femision']],
        ['fdesde', b['fdesde']],
        ['fhasta', b['fhasta']],
        ['fnac_tomador', b['fnac_tomador']],
        ['cestado_tomador', b['estado_tomador'] ?? b['cestado_tomador']],
        ['cciudad_tomador', b['ciudad_tomador'] ?? b['cciudad_tomador']],
        ['xplaca', b['xplaca'] ?? b['placa']],
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
      const badDates = [
        ['fecha_emision', b['fecha_emision'] ?? b['femision']],
        ['fdesde', b['fdesde']],
        ['fhasta', b['fhasta']],
        ['fnac_tomador', b['fnac_tomador']],
      ]
        .filter(([, value]) => typeof value !== 'string' || !isoDate.test(value))
        .map(([name]) => name);
      if (badDates.length > 0) {
        throw new BadRequestException(
          `Formato de fecha inválido (YYYY-MM-DD): ${badDates.join(', ')}`,
        );
      }

      const emissionSource = (
        this.config.get<string>('EMISSION_SOURCE', 'local') ?? 'local'
      ).toLowerCase();

      if (emissionSource === 'external') {
        return await this.createEmissionAutoExternal(b, canal, apikey);
      }
      return await this.emitLocalAutomobile(b, canal);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = parseSPError(err);
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

  private async emitLocalAutomobile(
    b: Record<string, unknown>,
    canal: Record<string, unknown>,
  ) {
    const T = this.db.types;
    const ctipocanal = (b['ctipocanal'] ??
      (canal['ctipocanal'] === 'A' ? canal['ctipocanal'] : null)) as string | null;
    const ccanalalt = (b['ccanalalt'] ??
      (canal['ctipocanal'] === 'A' ? canal['ccanalalt'] : null)) as number | null;
    const cscanalalt = (b['cscanalalt'] ??
      (canal['ctipocanal'] === 'A' ? canal['cscanalalt'] : null)) as number | null;

    const ins = this.db.request();
    const fields: Record<string, { type: unknown; value: unknown }> = {
      cnpoliza_rel: { type: T.NVarChar(30), value: b['cnpoliza_rel'] ?? (b['poliza'] ? `${b['poliza']}` : null) },
      cplan: { type: T.NVarChar(10), value: this.pick(b, 'cplan', 'plan') },
      icedula_tomador: {
        type: T.Char(1),
        value: this.pick(b, 'tipo_cedula_tomador', 'icedula_tomador', 'cedula_tomador'),
      },
      xrif_tomador: { type: T.Numeric(9), value: this.pick(b, 'xrif_tomador', 'rif_tomador') },
      xnombre_tomador: { type: T.NVarChar(250), value: this.pick(b, 'xnombre_tomador', 'nombre_tomador') },
      xapellido_tomador: { type: T.NVarChar(250), value: this.pick(b, 'xapellido_tomador', 'apellido_tomador') },
      isexo_tomador: { type: T.Char(1), value: this.pick(b, 'isexo_tomador', 'sexo_tomador') },
      iestado_civil_tomador: {
        type: T.Char(1),
        value: this.pick(b, 'iestado_civil_tomador', 'estado_civil_tomador'),
      },
      fnac_tomador: { type: T.Date, value: b['fnac_tomador'] },
      cestado_tomador: {
        type: T.NVarChar(100),
        value: this.nvarchar(this.pick(b, 'cestado_tomador', 'estado_tomador')),
      },
      cciudad_tomador: {
        type: T.NVarChar(100),
        value: this.nvarchar(this.pick(b, 'cciudad_tomador', 'ciudad_tomador')),
      },
      xdireccion_tomador: {
        type: T.NVarChar(1000),
        value: this.pick(b, 'xdireccion_tomador', 'direccion_tomador'),
      },
      xtelefono_tomador: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xtelefono_tomador', 'telefono_tomador'),
      },
      xcorreo_tomador: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xcorreo_tomador', 'correo_tomador'),
      },
      icedula_titular: {
        type: T.Char(1),
        value: this.pick(b, 'tipo_cedula_titular', 'icedula_titular', 'cedula_titular'),
      },
      xrif_titular: { type: T.Numeric(9), value: this.pick(b, 'xrif_titular', 'rif_titular') },
      xnombre_titular: { type: T.NVarChar(250), value: this.pick(b, 'xnombre_titular', 'nombre_titular') },
      xapellido_titular: { type: T.NVarChar(250), value: this.pick(b, 'xapellido_titular', 'apellido_titular') },
      isexo_titular: { type: T.Char(1), value: this.pick(b, 'isexo_titular', 'sexo_titular') },
      iestado_civil_titular: {
        type: T.Char(1),
        value: this.pick(b, 'iestado_civil_titular', 'estado_civil_titular'),
      },
      fnac_titular: { type: T.DateTime, value: b['fnac_titular'] ?? null },
      cestado_titular: {
        type: T.NVarChar(100),
        value: this.nvarchar(this.pick(b, 'cestado_titular', 'estado_titular')),
      },
      cciudad_titular: {
        type: T.NVarChar(100),
        value: this.nvarchar(this.pick(b, 'cciudad_titular', 'ciudad_titular')),
      },
      xdireccion_titular: {
        type: T.NVarChar(1000),
        value: this.pick(b, 'xdireccion_titular', 'direccion_titular'),
      },
      xtelefono_titular: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xtelefono_titular', 'telefono_titular'),
      },
      xcorreo_titular: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xcorreo_titular', 'correo_titular'),
      },
      cmarca: { type: T.Char(3), value: this.pick(b, 'cmarca', 'marca') },
      cmodelo: { type: T.Char(3), value: this.pick(b, 'cmodelo', 'modelo') },
      cversion: { type: T.Char(3), value: this.pick(b, 'cversion', 'version') },
      cano: { type: T.Int, value: this.pick(b, 'cano', 'fano') },
      xcolor: { type: T.VarChar(60), value: this.pick(b, 'xcolor', 'color') },
      xplaca: { type: T.VarChar(15), value: this.pick(b, 'xplaca', 'placa') },
      xsercar: { type: T.VarChar(60), value: this.pick(b, 'xsercar', 'serial_carroceria') },
      xsermot: { type: T.VarChar(60), value: this.pick(b, 'xsermot', 'serial_motor') ?? null },
      cpersona_politica: {
        type: T.Int,
        value: this.pick(b, 'cpersona_politica', 'dec_persona_politica'),
      },
      cterm_y_cod: { type: T.Int, value: this.pick(b, 'cterm_y_cod', 'dec_term_y_cod') },
      ctransporte_o_entrega: {
        type: T.Int,
        value: this.pick(b, 'ctransporte_o_entrega', 'dec_transporte_o_entrega') ?? null,
      },
      cproductor: {
        type: T.Int,
        value: this.pick(b, 'cproductor', 'productor') ?? canal['cproductor'] ?? 80080,
      },
      ctipocanal: { type: T.Char(1), value: ctipocanal },
      ccanalalt: { type: T.Int, value: ccanalalt },
      cscanalalt: { type: T.Int, value: cscanalalt },
      ptasamon: { type: T.Numeric(13, 6), value: null },
      mprimaext: {
        type: T.Numeric(18, 2),
        value: this.pick(b, 'mprimaext', 'prima', 'mprima_ext'),
      },
      ifrecuencia: { type: T.Char(1), value: this.pick(b, 'ifrecuencia', 'frecuencia') },
      femision: { type: T.DateTime, value: this.pick(b, 'femision', 'fecha_emision') },
      xcanal_venta: { type: T.NVarChar(250), value: canal['xcanal_venta'] ?? null },
      corigen_rel: { type: T.Char(2), value: canal['corigen_rel'] ?? null },
      api: { type: T.NVarChar(100), value: 'createEmissionAutoRCV' },
      method: { type: T.NVarChar(100), value: 'POST' },
      cprog: { type: T.Char(20), value: canal['cprog'] ?? 'eePoliza_AutoGe' },
      ifuente: { type: T.Char(10), value: canal['ifuente_api'] ?? canal['ifuente'] ?? 'API' },
      fingreso: { type: T.DateTime, value: new Date() },
      cpoliza: { type: T.VarChar(19), value: null },
      cnpoliza: { type: T.VarChar(30), value: null },
      cproces: { type: T.VarChar(13), value: null },
    };

    const cols = Object.keys(fields);
    cols.forEach((col) =>
      ins.input(col, (fields[col] as { type: unknown; value: unknown }).type, (fields[col] as { type: unknown; value: unknown }).value),
    );

    this.logger.log(
      `emitLocal: INSERT eePoliza_Automovil_General placa=${b['placa']} plan=${b['cplan'] ?? b['plan']}`,
    );

    const insertResult = await ins.query(`
      INSERT INTO eePoliza_Automovil_General (${cols.join(', ')})
      VALUES (${cols.map((c) => `@${c}`).join(', ')})
    `);

    const row = insertResult.recordset?.[0] ?? {};
    const cnpoliza = String(row['cnpoliza'] ?? '').trim();
    const cnrecibo = String(row['cnrecibo'] ?? '').trim();
    const fanopol = row['fanopol'] as number | undefined;
    const fmespol = row['fmespol'] as number | undefined;
    const ncuota = (row['qcuotas'] ?? row['ncuota']) as number | undefined;
    const pdfBase = (
      this.config.get<string>('POLICY_PDF_URL') ??
      this.config.get<string>('URLPoliza') ??
      ''
    )
      .trim()
      .replace(/\/$/, '');
    const urlpoliza =
      cnpoliza && fanopol != null && fmespol != null && pdfBase
        ? `${pdfBase}/${cnpoliza}/${fanopol}/${fmespol}/`
        : '';

    this.logger.log(`emitLocal OK cnpoliza=${cnpoliza} cnrecibo=${cnrecibo}`);

    return {
      message: 'Emisión registrada exitosamente.',
      cnpoliza,
      cnrecibo,
      urlpoliza,
      ncuota,
      fanopol,
      fmespol,
    };
  }

  private async createEmissionAutoExternal(
    b: Record<string, unknown>,
    canal: Record<string, unknown>,
    apikey: string,
  ) {
    const fechaEmision = String(b['fecha_emision'] ?? b['femision'] ?? '').trim();
    const payloadAPI = {
      cplan: String(b['cplan'] ?? b['plan'] ?? 'RCVBAS'),
      xrif_tomador: Number(b['rif_tomador']),
      xrif_titular: Number(b['rif_titular']),
      xplaca: String(b['xplaca'] ?? b['placa']),
      cmarca: String(b['cmarca'] ?? b['marca']),
      cmodelo: String(b['cmodelo'] ?? b['modelo']),
      cversion: String(b['cversion'] ?? b['version']),
      cano: Number(b['cano'] ?? b['fano']),
      femision: fechaEmision,
      fdesde: b['fdesde'] || fechaEmision,
      fhasta: b['fhasta'],
      mprima: Number(b['mprimaext'] ?? b['prima'] ?? 0),
      cproductor: Number(b['productor'] ?? canal['cproductor'] ?? 80080),
    };

    const externalUrl = this.config.get<string>('EXTERNAL_API_URL_AUTO', '');
    const externalKey = this.config.get<string>('EXTERNAL_API_KEY', apikey);
    const basicAuth = this.config.get<string>('EXTERNAL_BASIC_AUTH', '');

    if (!externalUrl) {
      this.logger.warn('EXTERNAL_API_URL_AUTO vacío; usando emisión local.');
      return this.emitLocalAutomobile(b, canal);
    }

    try {
      const response = await fetch(externalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: externalKey,
          ...(basicAuth ? { Authorization: basicAuth } : {}),
        },
        body: JSON.stringify(payloadAPI),
        signal: AbortSignal.timeout(15000),
      });
      const resData = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (response.status >= 500) {
        this.logger.warn(`API externa HTTP ${response.status}; fallback local.`);
        return this.emitLocalAutomobile(b, canal);
      }
      if (!response.ok) {
        throw new BadRequestException(
          (resData['message'] as string) || (resData['error'] as string) || `HTTP ${response.status}`,
        );
      }

      const dataObj = (resData['result'] ?? resData['data'] ?? resData) as Record<string, unknown>;
      return {
        message: (resData['message'] as string) || 'Emisión registrada via API externa.',
        cnpoliza: String(dataObj['poliza'] ?? dataObj['cnpoliza'] ?? ''),
        cnrecibo: String(dataObj['recibo'] ?? dataObj['cnrecibo'] ?? ''),
        urlpoliza: String(dataObj['urlpoliza'] ?? ''),
        ncuota: dataObj['ncuota'] as number | undefined,
        fanopol: dataObj['fanopol'] as number | undefined,
        fmespol: dataObj['fmespol'] as number | undefined,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(
        `Error API externa: ${err instanceof Error ? err.message : String(err)}; fallback local.`,
      );
      return this.emitLocalAutomobile(b, canal);
    }
  }
}
