import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { parseSPError, formatValidateAutoError } from '../../common/helpers/sp-error.helper';
import { SP_PRE_EMISION_AUTOMOVIL_RCV_NEXUS } from '../../config/sis2000-sp.constants';

@Injectable()
export class EmissionsService {
  private readonly logger = new Logger(EmissionsService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  /** SP pre-emisión RCV (Nexus); override con SP_PRE_EMISION_AUTO_RCV en .env. */
  private preEmisionAutoSpName(): string {
    return (
      this.config.get<string>('SP_PRE_EMISION_AUTO_RCV') ??
      SP_PRE_EMISION_AUTOMOVIL_RCV_NEXUS
    );
  }

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

  /** Entero Sis2000 (estado/ciudad/ramo); null si vacío. */
  private intField(value: unknown): number | null {
    if (value == null || String(value).trim() === '') return null;
    const n = parseInt(String(value), 10);
    return Number.isNaN(n) ? null : n;
  }

  /** Prima Bs: mprima explícita, o mprimaext × tasa (curl QA), o prima legacy. */
  private resolveMprima(b: Record<string, unknown>): number | null {
    const mprimaDirect = this.pick<number>(b, 'mprima');
    if (mprimaDirect != null && Number(mprimaDirect) > 0) return Number(mprimaDirect);

    const ext = this.pick<number>(b, 'mprimaext', 'mprima_ext');
    const tasa = this.resolvePtasamon(b);
    if (ext != null && tasa != null && Number(ext) > 0) {
      return Math.round(Number(ext) * Number(tasa) * 100) / 100;
    }

    const prima = this.pick<number>(b, 'prima');
    return prima != null ? Number(prima) : null;
  }

  /** Tasa BCV: ptasa / tasa / ptasamon (alias La Mundial). */
  private resolvePtasamon(b: Record<string, unknown>): number | null {
    const v = this.pick<number>(b, 'ptasa', 'tasa', 'ptasamon', 'ptasamon_pago');
    return v != null ? Number(v) : null;
  }

  /** Flag char(1) para SP (cpersona_politica, cterm_y_cod). */
  private spCharFlag(value: unknown, defaultVal = '0'): string {
    if (value == null || String(value).trim() === '') return defaultVal;
    return String(value).trim().charAt(0);
  }

  /** Fila devuelta por sp_pre_emision / sp_emision (recordsets anidados). */
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

  /** Fallback: última póliza/recibo por placa tras emisión RCV2. */
  private async lookupEmissionByPlaca(xplaca: string): Promise<Record<string, unknown>> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('xplaca', T.VarChar(15), xplaca.trim().toUpperCase());
    const result = await req.query(`
      SELECT TOP 1
        cert.cnpoliza,
        pol.fanopol,
        pol.fmespol,
        rec.cnrecibo,
        rec.qcuotas
      FROM vhcerti cert
      INNER JOIN adpoliza pol ON pol.cnpoliza = cert.cnpoliza
      INNER JOIN adrecibos rec ON rec.cnpoliza = cert.cnpoliza AND rec.qcuotas = cert.qcuotas
      WHERE cert.xplaca = @xplaca
      ORDER BY pol.femision DESC, rec.cnrecibo DESC
    `);
    return (result.recordset?.[0] ?? {}) as Record<string, unknown>;
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
    const defaultPlan = this.config.get<string>('LAMUNDIAL_PLAN_DEFAULT', 'RCVBAS');
    const cplan = String(body.plan ?? defaultPlan).trim() || defaultPlan;
    req.input('cplan', T.VarChar(10), cplan);
    req.input('xplaca', T.VarChar(15), body.placa);
    req.input('xsercar', T.VarChar(60), body.serial_carroceria);
    req.input('xsermot', T.VarChar(60), null);
    try {
      await req.execute('speeValidateAutomovilGeneral');
      return { status: true, message: 'El vehículo puede asegurarse. No hay póliza vigente con esta placa ni serial.' };
    } catch (err) {
      const raw = parseSPError(err);
      const formatted = formatValidateAutoError(raw);
      this.logger.warn(`validateEmissionAuto (SP): ${raw} → ${formatted.code}`);
      return { status: false, error: formatted.message, code: formatted.code };
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
            cprog: 'eePoliza_AutoRcv2',
            ctipocanal: null,
            ccanalalt: null,
            cscanalalt: null,
          };

      const b: Record<string, unknown> = { ...body };

      // cnpoliza lo genera Sis2000; string vacío bloquea el SP (no entra a IF @cnpoliza IS NULL)
      if (b['cnpoliza'] == null || String(b['cnpoliza']).trim() === '') {
        delete b['cnpoliza'];
      }
      if (b['cpoliza'] == null || String(b['cpoliza']).trim() === '') {
        delete b['cpoliza'];
      }

      if (
        (canal['ctipocanal'] === 'T' ||
          canal['ctipocanal'] === 'A' ||
          canal['ctipocanal'] === 'D') &&
        !b['ctipocanal']
      ) {
        b['ctipocanal'] = canal['ctipocanal'];
        b['ccanalalt'] = canal['ccanalalt'];
        b['cscanalalt'] = canal['cscanalalt'];
        b['cproductor'] = canal['cproductor'];
      }

      if (!b['fecha_emision'] && b['femision']) {
        b['fecha_emision'] = b['femision'];
      }
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

  /** Sincroniza macontadores POL_VEH con el máximo cnpoliza conocido (adpóliza + cola). */
  private async syncPolVehCounter(cramo: number): Promise<void> {
    const req = this.db.request();
    req.input('cramo', this.db.types.Int, cramo);
    const result = await req.query(`
      DECLARE @max BIGINT;

      SELECT @max = MAX(TRY_CAST(RIGHT(cnpoliza, 10) AS BIGINT))
      FROM adpoliza
      WHERE cramo = @cramo AND cnpoliza LIKE CAST(@cramo AS VARCHAR) + '-%';

      DECLARE @maxPending BIGINT;
      SELECT @maxPending = MAX(TRY_CAST(RIGHT(cnpoliza, 10) AS BIGINT))
      FROM TMEMISION_AUTOMOVIL_RCV2
      WHERE cramo = @cramo
        AND cnpoliza IS NOT NULL
        AND LTRIM(RTRIM(cnpoliza)) <> ''
        AND cnpoliza LIKE CAST(@cramo AS VARCHAR) + '-%';

      IF @maxPending > ISNULL(@max, 0) SET @max = @maxPending;

      IF @max IS NOT NULL
        UPDATE macontadores SET qcontador = @max WHERE ccontador = 'POL_VEH';

      SELECT ISNULL(qcontador, 0) AS qcontador FROM macontadores WHERE ccontador = 'POL_VEH';
    `);
    const q = result.recordset?.[0]?.['qcontador'];
    this.logger.log(`syncPolVehCounter: cramo=${cramo} qcontador=${q ?? '?'}`);
  }

  private async bumpPolVehCounter(): Promise<void> {
    await this.db.request().query(`
      UPDATE macontadores
      SET qcontador = ISNULL(qcontador, 0) + 1
      WHERE ccontador = 'POL_VEH';
    `);
  }

  private isCounterCollisionMessage(msg: string): boolean {
    const lower = msg.toLowerCase();
    return lower.includes('póliza rel ya existente') || lower.includes('poliza rel ya existente');
  }

  /** Beneficiario preferencial anidado (createEmissionAuto / policyMapper). */
  private extractBeneficiario(b: Record<string, unknown>): Record<string, unknown> | null {
    const raw = b['beneficiario'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const ben = raw as Record<string, unknown>;
    const rif = ben['xrif_beneficiario'] ?? ben['rif_beneficiario'] ?? ben['identificacion'];
    if (rif == null || String(rif).replace(/\D/g, '') === '') return null;
    return ben;
  }

  /**
   * RCV2 fija cbeneficiario = titular en sp_Emision_Automovil_RCV2.
   * Tras emitir: crea maclient y actualiza cbeneficiario en póliza/recibos/certificados.
   */
  private async applyBeneficiarioPreferencial(
    b: Record<string, unknown>,
    canal: Record<string, unknown>,
    cnpoliza: string,
    fanopol?: number,
    fmespol?: number,
  ): Promise<void> {
    const ben = this.extractBeneficiario(b);
    if (!ben) return;

    const T = this.db.types;
    const rif = Number(String(ben['xrif_beneficiario'] ?? ben['rif_beneficiario']).replace(/\D/g, ''));
    if (!Number.isFinite(rif) || rif <= 0) return;

    const icedula = String(ben['icedula_beneficiario'] ?? 'V').trim().charAt(0) || 'V';
    const xnombre = String(ben['xnombre_beneficiario'] ?? ben['nombre'] ?? '').trim();
    const xapellido = String(ben['xapellido_beneficiario'] ?? ben['apellido'] ?? '').trim();
    const xcliente = `${xnombre} ${xapellido}`.trim();
    const isexo = String(ben['isexo_beneficiario'] ?? ben['sexo'] ?? 'M').trim().charAt(0) || 'M';
    const iestadoCivil =
      String(ben['iestado_civil_beneficiario'] ?? ben['estadoCivil'] ?? 'S').trim().charAt(0) || 'S';
    const fnac = ben['fnac_beneficiario'] ?? ben['fechaNac'] ?? null;
    const xcorreo = ben['xcorreo_beneficiario'] ?? ben['email'] ?? null;
    const cestado = this.intField(ben['cestado_beneficiario'] ?? ben['cestado']);
    const cciudad = this.intField(ben['cciudad_beneficiario'] ?? ben['cciudad']);
    const xdireccion = ben['xdireccion_beneficiario'] ?? ben['direccion'] ?? null;
    const xtelefono = ben['xtelefono_beneficiario'] ?? ben['telefono'] ?? null;
    const ifuente = String(canal['ifuente_api'] ?? canal['ifuente'] ?? 'API').slice(0, 10);

    const macReq = this.db.request();
    macReq.input('icedula', T.Char(1), icedula);
    macReq.input('cci_rif', T.Numeric(13, 0), rif);
    macReq.input('xnombre', T.VarChar(120), xnombre || null);
    macReq.input('xapellido', T.VarChar(120), xapellido || null);
    macReq.input('xcliente', T.VarChar(250), xcliente || null);
    macReq.input('isexo', T.Char(1), isexo);
    macReq.input('iestado_civil', T.Char(1), iestadoCivil);
    macReq.input('fnac', T.DateTime, fnac);
    macReq.input('xcorreo', T.Char(60), xcorreo != null ? String(xcorreo).slice(0, 60) : null);
    macReq.input('cpais', T.SmallInt, 58);
    macReq.input('cestado', T.SmallInt, cestado);
    macReq.input('cciudad', T.SmallInt, cciudad);
    macReq.input(
      'xdireccion',
      T.Char(60),
      xdireccion != null ? String(xdireccion).slice(0, 60) : null,
    );
    macReq.input('czonapos', T.Char(10), null);
    macReq.input(
      'xtelefono',
      T.Char(20),
      xtelefono != null ? String(xtelefono).replace(/\D/g, '').slice(0, 20) : null,
    );
    macReq.input('ifuente', T.Char(10), ifuente);
    macReq.output('salida', T.VarChar(50), '');
    await macReq.execute('spCreateMaclient');

    const polReq = this.db.request();
    polReq.input('cnpoliza', T.NVarChar(30), cnpoliza);
    const polResult = await polReq.query(`
      SELECT TOP 1 fanopol, fmespol, cpoliza
      FROM adpoliza
      WHERE cnpoliza = @cnpoliza
      ORDER BY fingreso DESC
    `);
    const polRow = polResult.recordset?.[0] as Record<string, unknown> | undefined;
    if (!polRow) {
      this.logger.warn(`applyBeneficiario: póliza ${cnpoliza} no encontrada en adpoliza`);
      return;
    }

    const fano = fanopol ?? Number(polRow['fanopol']);
    const fmes = fmespol ?? Number(polRow['fmespol']);
    const cpoliza = polRow['cpoliza'];

    const upd = this.db.request();
    upd.input('rif', T.Numeric(13, 0), rif);
    upd.input('cnpoliza', T.NVarChar(30), cnpoliza);
    upd.input('fanopol', T.SmallInt, fano);
    upd.input('fmespol', T.TinyInt, fmes);
    upd.input('cpoliza', T.Numeric(19, 0), cpoliza);
    await upd.query(`
      UPDATE adpoliza SET cbeneficiario = @rif
      WHERE cnpoliza = @cnpoliza AND fanopol = @fanopol AND fmespol = @fmespol;
      UPDATE adrecibos SET cbeneficiario = @rif
      WHERE cnpoliza = @cnpoliza AND fanopol = @fanopol AND fmespol = @fmespol;
      UPDATE vhofcert SET cbeneficiario = @rif WHERE cpoliza = @cpoliza;
      UPDATE vhcerti SET cbeneficiario = @rif WHERE cnpoliza = @cnpoliza;
    `);

    this.logger.log(`applyBeneficiario OK cnpoliza=${cnpoliza} rif=${rif}`);
  }

  private async emitLocalAutomobile(
    b: Record<string, unknown>,
    canal: Record<string, unknown>,
  ) {
    const T = this.db.types;
    const ptasamon = this.resolvePtasamon(b);
    const mprima = this.resolveMprima(b);
    const defaultRamo = parseInt(this.config.get<string>('LAMUNDIAL_RAMO', '18') ?? '18', 10);
    const femision =
      this.pick<string>(b, 'fecha_emision', 'femision') ??
      new Date().toISOString().slice(0, 10);

    const req = this.db.request();
    const params: Record<string, { type: unknown; value: unknown }> = {
      cnpoliza_rel: {
        type: T.NVarChar(30),
        value: this.nvarchar(this.pick(b, 'cnpoliza_rel', 'poliza')),
      },
      cramo: {
        type: T.Int,
        value: this.intField(this.pick(b, 'cramo', 'ramo')) ?? defaultRamo,
      },
      cplan: { type: T.NVarChar(10), value: this.pick(b, 'cplan', 'plan') },
      xcanal_venta: { type: T.NVarChar(250), value: canal['xcanal_venta'] ?? null },
      icedula_tomador: {
        type: T.Char(1),
        value: this.pick(b, 'icedula_tomador', 'tipo_cedula_tomador', 'cedula_tomador'),
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
        type: T.VarChar(100),
        value: String(this.pick(b, 'cestado_tomador', 'estado_tomador') ?? ''),
      },
      cciudad_tomador: {
        type: T.VarChar(100),
        value: String(this.pick(b, 'cciudad_tomador', 'ciudad_tomador') ?? ''),
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
        value: this.pick(b, 'icedula_titular', 'tipo_cedula_titular', 'cedula_titular'),
      },
      xrif_titular: { type: T.Numeric(9), value: this.pick(b, 'xrif_titular', 'rif_titular') },
      xnombre_titular: { type: T.NVarChar(250), value: this.pick(b, 'xnombre_titular', 'nombre_titular') },
      xapellido_titular: { type: T.NVarChar(250), value: this.pick(b, 'xapellido_titular', 'apellido_titular') },
      isexo_titular: { type: T.Char(1), value: this.pick(b, 'isexo_titular', 'sexo_titular') },
      iestado_civil_titular: {
        type: T.Char(1),
        value: this.pick(b, 'iestado_civil_titular', 'estado_civil_titular'),
      },
      fnac_titular: { type: T.Date, value: b['fnac_titular'] ?? null },
      cestado_titular: {
        type: T.VarChar(100),
        value: String(this.pick(b, 'cestado_titular', 'estado_titular') ?? ''),
      },
      cciudad_titular: {
        type: T.VarChar(100),
        value: String(this.pick(b, 'cciudad_titular', 'ciudad_titular') ?? ''),
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
      cmarca: { type: T.VarChar(3), value: this.pick(b, 'cmarca', 'marca') },
      cmodelo: { type: T.VarChar(3), value: this.pick(b, 'cmodelo', 'modelo') },
      cversion: { type: T.VarChar(3), value: this.pick(b, 'cversion', 'version') },
      cano: { type: T.SmallInt, value: this.pick(b, 'cano', 'fano', 'año') },
      xcolor: { type: T.VarChar(60), value: this.pick(b, 'xcolor', 'color') },
      xplaca: { type: T.VarChar(15), value: this.pick(b, 'xplaca', 'placa') },
      xsercar: { type: T.VarChar(60), value: this.pick(b, 'xsercar', 'serial_carroceria') },
      xsermot: {
        type: T.VarChar(60),
        value: this.pick(b, 'xsermot', 'serial_motor') ?? null,
      },
      cpersona_politica: {
        type: T.Char(1),
        value: this.spCharFlag(this.pick(b, 'cpersona_politica', 'dec_persona_politica'), '0'),
      },
      cterm_y_cod: {
        type: T.Char(1),
        value: this.spCharFlag(this.pick(b, 'cterm_y_cod', 'dec_term_y_cod'), '1'),
      },
      cproductor: {
        type: T.Int,
        value: this.pick(b, 'cproductor', 'productor') ?? canal['cproductor'] ?? 80080,
      },
      ptasamon: { type: T.Numeric(18, 6), value: ptasamon },
      mprima: { type: T.Numeric(18, 2), value: mprima },
      ifrecuencia: {
        type: T.Char(1),
        value: this.pick(b, 'ifrecuencia', 'frecuencia') ?? 'A',
      },
      femision: { type: T.Date, value: femision },
      corigen_rel: { type: T.Char(2), value: canal['corigen_rel'] ?? null },
      api: { type: T.NVarChar(100), value: 'tmCreateEmission' },
      method: { type: T.NVarChar(100), value: 'createEmmisionAutomobileRcv2' },
      cprog: { type: T.Char(20), value: 'eePoliza_AutoRcv2' },
      ifuente: { type: T.Char(10), value: canal['ifuente_api'] ?? canal['ifuente'] ?? 'API' },
      fingreso: { type: T.DateTime, value: new Date() },
      cpoliza: { type: T.Numeric(19, 0), value: null },
      cnpoliza: { type: T.NVarChar(30), value: this.nvarchar(this.pick(b, 'cnpoliza')) },
      cproces: { type: T.Numeric(13, 0), value: null },
      ctipocanal: {
        type: T.Char(1),
        value: (b['ctipocanal'] ? String(b['ctipocanal']) : null) as string | null,
      },
      ccanalalt: {
        type: T.Int,
        value: b['ccanalalt'] != null ? this.intField(b['ccanalalt']) : null,
      },
      cscanalalt: {
        type: T.Int,
        value: b['cscanalalt'] != null ? this.intField(b['cscanalalt']) : null,
      },
      cusuario: {
        type: T.Numeric(13, 0),
        value: this.intField(this.pick(b, 'cusuario')) ?? null,
      },
      ptasamon_pago: { type: T.Numeric(18, 6), value: ptasamon },
      cmoneda: {
        type: T.Char(4),
        value: this.pick(b, 'cmoneda') ? String(this.pick(b, 'cmoneda')).slice(0, 4) : null,
      },
      msumaaseg: {
        type: T.Numeric(18, 2),
        value: this.pick(b, 'msumaaseg', 'sumaaseg') ?? null,
      },
      xmarca: { type: T.VarChar(60), value: this.pick(b, 'xmarca') ?? null },
      xmodelo: { type: T.VarChar(60), value: this.pick(b, 'xmodelo') ?? null },
      xversion: { type: T.VarChar(60), value: this.pick(b, 'xversion') ?? null },
      ccategoria_uso: {
        type: T.Int,
        value: this.intField(this.pick(b, 'ccategoria_uso')),
      },
      npuestos: {
        type: T.Int,
        value: this.intField(this.pick(b, 'npuestos')) ?? null,
      },
      ntoneladas: {
        type: T.Int,
        value: this.intField(this.pick(b, 'ntoneladas')) ?? null,
      },
      iplaca: {
        type: T.Char(1),
        value: String(this.pick(b, 'iplaca', 'tipo_placa') ?? 'N').trim().charAt(0).toUpperCase(),
      },
      precargorcv: {
        type: T.Numeric(18, 2),
        value: this.pick(b, 'precargorcv') ?? null,
      },
      fdesde: { type: T.Date, value: b['fdesde'] },
      fhasta: { type: T.Date, value: b['fhasta'] },
    };

    Object.entries(params).forEach(([key, field]) =>
      req.input(key, (field as { type: unknown }).type, (field as { value: unknown }).value),
    );

    const xplaca = String(this.pick(b, 'xplaca', 'placa') ?? '').trim();
    const preEmisionSp = this.preEmisionAutoSpName();
    this.logger.log(
      `emitLocal: EXEC ${preEmisionSp} placa=${xplaca} plan=${b['cplan'] ?? b['plan']} mprima=${mprima} ptasamon=${ptasamon}`,
    );

    await this.syncPolVehCounter(
      this.intField(this.pick(b, 'cramo', 'ramo')) ?? defaultRamo,
    );

    let spResult: {
      recordset?: Record<string, unknown>[];
      recordsets?: Record<string, unknown>[][];
    };
    try {
      spResult = await req.execute(preEmisionSp);
    } catch (err) {
      const msg = parseSPError(err);
      if (!this.isCounterCollisionMessage(msg)) throw err;
      this.logger.warn(`emitLocal: contador POL_VEH desfasado (${msg}); reintento tras sync`);
      await this.syncPolVehCounter(
        this.intField(this.pick(b, 'cramo', 'ramo')) ?? defaultRamo,
      );
      const retryReq = this.db.request();
      Object.entries(params).forEach(([key, field]) =>
        retryReq.input(key, (field as { type: unknown }).type, (field as { value: unknown }).value),
      );
      spResult = await retryReq.execute(preEmisionSp);
    }

    let row = this.extractEmissionRow(
      spResult as { recordset?: Record<string, unknown>[]; recordsets?: Record<string, unknown>[][] },
    );
    if (!row['cnpoliza'] && xplaca) {
      this.logger.warn(`emitLocal: SP sin cnpoliza en recordset; lookup placa=${xplaca}`);
      row = await this.lookupEmissionByPlaca(xplaca);
    }
    if (!row['cnpoliza']) {
      this.logger.error(
        `emitLocal: ${preEmisionSp} sin cnpoliza. recordsets=${spResult.recordsets?.length ?? 0}`,
      );
      throw new InternalServerErrorException(
        'Emisión RCV sin cnpoliza/cnrecibo en respuesta de Sis2000.',
      );
    }

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

    if (this.extractBeneficiario(b)) {
      try {
        await this.applyBeneficiarioPreferencial(b, canal, cnpoliza, fanopol, fmespol);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`applyBeneficiario falló cnpoliza=${cnpoliza}: ${msg}`);
      }
    }

    return {
      message: 'Póliza generada exitosamente',
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
