import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { formatValidateAutoError, parseSPError } from '../../common/helpers/sp-error.helper';
import { buildPolicyPdfUrl, resolveClubArysPdfUrl } from '../../common/helpers/policy-url.helper';
import {
  SP_PRE_EMISION_AUTO_RCV,
  SP_REPAIR_RCV_COBERTURAS,
  SP_SEARCH_AUTOMOBILE_PROPIETARY,
  SP_VALIDATE_AUTOMOVIL_LEGACY,
} from '../../config/sis2000-sp.constants';
import { SearchProprietaryDto } from './dto/search-proprietary.dto';
import { SearchVehicleByPlateDto, SearchVehicleBySerialDto } from './dto/search-vehicle.dto';

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

  /** Plan en USD/Dólares (maplanes.cmoneda). */
  private isUsdMoneda(cmoneda: string | null | undefined): boolean {
    const m = String(cmoneda ?? '').trim().toUpperCase();
    if (!m || m === 'BS') return false;
    return m === '$' || m === 'USD' || m.startsWith('DOL');
  }

  /** Moneda del plan en maplanes (ej. '$' para planes premium AutoV). */
  private async resolvePlanMoneda(cplan: string): Promise<string | null> {
    const plan = String(cplan ?? '').trim();
    if (!plan) return null;
    const T = this.db.types;
    const req = this.db.request();
    req.input('cplan', T.VarChar(10), plan);
    const result = await req.query<{ cmoneda: string }>(
      `SELECT TOP 1 RTRIM(cmoneda) AS cmoneda FROM maplanes WHERE cplan = @cplan AND iestado = 'V'`,
    );
    const raw = result.recordset?.[0]?.cmoneda;
    return raw != null && String(raw).trim() !== '' ? String(raw).trim() : null;
  }

  /**
   * Prima para el SP de pre-emisión.
   * Debe reinyectarse la prima cotizada (igual que SysIP-backend): si va en 0 el SP
   * recalcula y los recibos del cuadro no coinciden con la cuota mostrada en UI.
   * - Planes en $: @mprima = mprimaext (USD)
   * - Planes en Bs: @mprima = mprima o mprimaext × ptasa
   */
  private async resolveMprimaForSp(
    b: Record<string, unknown>,
  ): Promise<{ mprima: number | null; cmoneda: string | null }> {
    const cplan = String(this.pick(b, 'cplan', 'plan') ?? '').trim();
    let cmoneda = this.pick(b, 'cmoneda')
      ? String(this.pick(b, 'cmoneda')).trim().slice(0, 4)
      : null;
    if (!cmoneda && cplan) {
      cmoneda = await this.resolvePlanMoneda(cplan);
    }

    if (this.isUsdMoneda(cmoneda)) {
      const ext = Number(this.pick(b, 'mprimaext', 'mprima_ext') ?? 0);
      return {
        mprima: Number.isFinite(ext) && ext > 0 ? ext : 0,
        cmoneda: '$',
      };
    }

    const mprima = this.resolveMprima(b);
    return {
      mprima: mprima != null && Number(mprima) > 0 ? Number(mprima) : 0,
      cmoneda,
    };
  }

  /** Log de trazabilidad prima: body HTTP vs valor enviado al SP. */
  private logEmissionPrima(b: Record<string, unknown>, mprima: number | null, cmoneda: string | null): void {
    this.logger.log(
      `emitLocal prima trace body.mprimaext=${this.pick(b, 'mprimaext') ?? 'null'} body.mprima=${this.pick(b, 'mprima') ?? 'null'} → SP @mprima=${mprima} cmoneda=${cmoneda ?? 'null'} ifrecuencia=${this.pick(b, 'ifrecuencia', 'frecuencia') ?? 'A'}`,
    );
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

  /** Cobertura Club Arys: adpolcob ccober=15 en ramo 18 (igual SysIP Poliza.js). */
  private async queryClubArysInDb(cnpoliza: string): Promise<boolean> {
    const poliza = String(cnpoliza ?? '').trim();
    if (!poliza) return false;

    const T = this.db.types;
    const req = this.db.request();
    req.input('cnpoliza', T.Char(30), poliza);
    const result = await req.query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM adpolcob c
        INNER JOIN adpoliza p ON p.cpoliza = c.cpoliza
        WHERE LTRIM(RTRIM(p.cnpoliza)) = LTRIM(RTRIM(@cnpoliza))
          AND LTRIM(RTRIM(c.ccober)) = '15'
          AND c.cramo = 18
      ) THEN 1 ELSE 0 END AS hasArys
    `);
    return Number(result.recordset?.[0]?.['hasArys'] ?? 0) === 1;
  }

  /** Planes legacy / patrimoniales con Club Arys sin depender del catálogo. */
  private planIncludesClubArysLegacy(body: Record<string, unknown>): boolean {
    const plan = String(this.pick(body, 'cplan', 'plan') ?? '')
      .trim()
      .toUpperCase();
    if (['RCVBAS', 'RUSPAT'].includes(plan)) return true;
    const centidad = String(this.pick(body, 'centidad') ?? '').trim().toUpperCase();
    return centidad === 'P';
  }

  /** SysIP receipt-vehicle-form: ccobertura 15 en maplancob (cotización / catálogo plan). */
  private async queryPlanHasClubArysInCatalog(
    cplan: string,
    cramo = 18,
  ): Promise<boolean> {
    const plan = String(cplan ?? '').trim();
    if (!plan) return false;

    const T = this.db.types;
    const req = this.db.request();
    req.input('cplan', T.NVarChar(20), plan);
    req.input('cramo', T.Int, cramo);
    const result = await req.query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM maplancob m
        WHERE m.cramo = @cramo
          AND LTRIM(RTRIM(m.cplan)) = LTRIM(RTRIM(@cplan))
          AND LTRIM(RTRIM(CAST(m.ccobertura AS VARCHAR(10)))) = '15'
      ) THEN 1 ELSE 0 END AS hasArys
    `);
    return Number(result.recordset?.[0]?.['hasArys'] ?? 0) === 1;
  }

  private async hasClubArysCoverage(
    cnpoliza: string,
    body?: Record<string, unknown>,
  ): Promise<boolean> {
    if (body) {
      const cplan = String(this.pick(body, 'cplan', 'plan') ?? '').trim();
      const cramo = this.intField(this.pick(body, 'cramo', 'ramo')) ?? 18;
      if (cplan) {
        try {
          if (await this.queryPlanHasClubArysInCatalog(cplan, cramo)) return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Club Arys catálogo cplan=${cplan}: ${msg}`);
        }
      }
      if (this.planIncludesClubArysLegacy(body)) return true;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        if (await this.queryClubArysInDb(cnpoliza)) return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Club Arys query cnpoliza=${cnpoliza}: ${msg}`);
      }
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    return false;
  }

  private resolveClubArysPdfUrl(hasCoverage: boolean, iplaca?: unknown): string {
    return resolveClubArysPdfUrl(
      hasCoverage,
      iplaca,
      this.config.get<string>('ARYS_TRADICIONAL_PDF_URL'),
      this.config.get<string>('ARYS_AUTO_BI_PDF_URL'),
    );
  }

  private async resolveClubArysPdfForEmission(
    cnpoliza: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    try {
      const hasArys = await this.hasClubArysCoverage(cnpoliza, body);
      return this.resolveClubArysPdfUrl(hasArys, this.pick(body, 'iplaca'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Club Arys PDF omitido cnpoliza=${cnpoliza}: ${msg}`);
      return '';
    }
  }

  /**
   * Migración de SysIP Express `POST /api/v1/emissions/automobile/vehicle`.
   * Usa `dbo.fn_validar_placa(@xplaca, @fdesde)` — no la búsqueda por vhcerti.
   *
   * Compat Express:
   * - Placa activa → `{ status: true, message }` (`type === 'warning'` cambia el texto)
   * - Placa libre  → `{ status: false }`
   */
  async searchByPlate(dto: SearchVehicleByPlateDto) {
    const xplaca = String(dto.xplaca ?? dto.placa ?? '').trim();
    if (!xplaca) {
      throw new BadRequestException('Debe enviar `xplaca` o `placa`.');
    }
    if (!dto.fdesde) {
      throw new BadRequestException('Debe enviar `fdesde`.');
    }

    try {
      const req = this.db.request();
      const T = this.db.types;
      req.input('xplaca', T.VarChar(15), xplaca);
      req.input('fdesde', T.Date, new Date(dto.fdesde));
      const result = await req.query(`
        SELECT ISNULL(dbo.fn_validar_placa(@xplaca, @fdesde), 0) AS is_active
      `);
      const isActive = Boolean(result.recordset?.[0]?.['is_active']);

      if (isActive) {
        const message =
          dto.type === 'warning'
            ? 'ADVERTENCIA: el campo PLACA ya se encuentra registrado y activo en el sistema.'
            : 'Lo sentimos, el campo PLACA ingresado ya se encuentra registrado y activo en el sistema';
        return { status: true as const, message, is_active: true };
      }

      return { status: false as const, is_active: false };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchByPlate: ${msg}`);
      throw new InternalServerErrorException('Error al validar placa.');
    }
  }

  /**
   * Migración de SysIP Express `POST /api/v1/emissions/automobile/serial`.
   * Usa `dbo.fn_validar_serialCar(@xsercar, @fdesde)`.
   *
   * Compat Express:
   * - Serial activo → `{ status: true, message }` (`type === 'warning'` cambia el texto)
   * - Serial libre  → `{ status: false }`
   */
  async searchBySerial(dto: SearchVehicleBySerialDto) {
    const xsercar = String(dto.xsercar ?? dto.xserialcarroceria ?? '').trim();
    if (!xsercar) {
      throw new BadRequestException('Debe enviar `xsercar` o `xserialcarroceria`.');
    }
    if (!dto.fdesde) {
      throw new BadRequestException('Debe enviar `fdesde`.');
    }

    try {
      const req = this.db.request();
      const T = this.db.types;
      req.input('xsercar', T.VarChar(60), xsercar);
      req.input('fdesde', T.Date, new Date(dto.fdesde));
      const result = await req.query(`
        SELECT ISNULL(dbo.fn_validar_serialCar(@xsercar, @fdesde), 0) AS is_active
      `);
      const isActive = Boolean(result.recordset?.[0]?.['is_active']);

      if (isActive) {
        const message =
          dto.type === 'warning'
            ? 'ADVERTENCIA: el campo SERIAL DE CARROCERÍA ya se encuentra registrado y activo en el sistema.'
            : 'Lo sentimos, el campo SERIAL DE CARROCERÍA ingresado ya se encuentra registrado y activo en el sistema';
        return { status: true as const, message, is_active: true };
      }

      return { status: false as const, is_active: false };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchBySerial: ${msg}`);
      throw new InternalServerErrorException('Error al validar serial de carrocería.');
    }
  }

  /** SP Nexus primero; si no hay fila, consulta SQL a `maclient`. */
  async searchAutomobileProprietary(dto: SearchProprietaryDto) {
    const cid = String(dto.cid ?? dto.xrif_cliente ?? '').trim();
    if (!cid) {
      throw new BadRequestException('Debe enviar `xrif_cliente` o `cid`.');
    }

    try {
      return await this.searchNewPropietary(cid);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return await this.searchNewProprietary(dto);
      }
      throw err;
    }
  }

  async searchNewPropietary(xrif_cliente: string) {
    const cid = xrif_cliente.trim();
    if (!cid) {
      throw new BadRequestException('xrif_cliente es requerido.');
    }

    try {
      const req = this.db.request();
      const T = this.db.types;
      req.input('cid', T.VarChar(20), cid);
      const result = await req.execute(SP_SEARCH_AUTOMOBILE_PROPIETARY);
      const rows = result.recordset ?? [];
      if (rows.length === 0) {
        throw new NotFoundException({
          status: false,
          notFound: 'Propietario no encontrado',
        });
      }
      return { status: true as const, info: rows[0] as Record<string, unknown> };
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchNewPropietary: ${msg}`);
      throw new InternalServerErrorException({
        status: false,
        message: msg,
      });
    }
  }

  /**
   * Migración de SysIP Express `POST /api/v1/emissions/automobile_new/propietary`.
   * Busca propietario/cliente en `maclient` (+ dirección, correo, teléfono, atributos).
   *
   * Acepta documento con o sin letra (`V22` / `22`). Coincide contra:
   * - `maclient.cci_rif` (cédula numérica — lo habitual en formularios)
   * - `maclient.cid` (documento completo o solo dígitos)
   */
  async searchNewProprietary(dto: SearchProprietaryDto) {
    const raw = String(dto.cid ?? dto.xrif_cliente ?? '').trim();
    if (!raw) {
      throw new BadRequestException('Debe enviar `xrif_cliente` o `cid`.');
    }

    const digits = raw.replace(/\D/g, '');
    const letterMatch = raw.match(/^([A-Za-z])/);
    const letter = (letterMatch?.[1] ?? 'V').toUpperCase();
    const cidWithLetter = digits ? `${letter}${digits}` : raw.toUpperCase();

    try {
      const req = this.db.request();
      const T = this.db.types;
      req.input('cidRaw', T.VarChar(30), raw);
      req.input('cidDigits', T.VarChar(30), digits || raw);
      req.input('cidLetter', T.VarChar(30), cidWithLetter);
      req.input('cciRif', T.VarChar(30), digits || raw);

      const result = await req.query(`
        SELECT TOP 1
          RTRIM(LTRIM(maclient.xnombre_1))   AS xnombre,
          RTRIM(LTRIM(maclient.xapellido_1)) AS xapellido,
          CONVERT(DATE, maclient.fnacimiento) AS fnacimiento,
          maclient.isexo,
          maclient.npeso,
          maclient.nestatura,
          maclient.ipersona,
          maclient.iestado_civil,
          maclient_dir.cestado,
          RTRIM(LTRIM(maestados.xdescripcion_c)) AS xestado,
          maclient_dir.cciudad,
          maclient.cci_rif,
          maclient.cid,
          TRIM(maciudades.xdescripcion_c) AS xciudad,
          TRIM(maclient_dir.xavecalle)    AS xavecalle,
          TRIM(maclient_correo.xcorreo)   AS xcorreo,
          TRIM(maclient_tel.xtelefono)    AS xtelefono,
          TRIM(maclient.xcliente)         AS cliente,
          CASE
            WHEN maclient.fnacimiento IS NOT NULL
              AND DATEDIFF(YEAR, maclient.fnacimiento, GETDATE())
                - CASE
                    WHEN MONTH(maclient.fnacimiento) > MONTH(GETDATE())
                      OR (
                        MONTH(maclient.fnacimiento) = MONTH(GETDATE())
                        AND DAY(maclient.fnacimiento) > DAY(GETDATE())
                      )
                    THEN 1
                    ELSE 0
                  END >= 18
            THEN 1
            ELSE 0
          END AS es_mayor_de_edad,
          COALESCE(maprofes.xprofesion, '') AS xprofesion,
          COALESCE(maocupac.xocupacion, '') AS xocupacion,
          COALESCE(maactivi.xactividad, '') AS xactividad
        FROM maclient
        LEFT JOIN maclient_dir
          ON maclient.cci_rif = maclient_dir.cci_rif
        LEFT JOIN maclient_correo
          ON maclient.cci_rif = maclient_correo.cci_rif
        LEFT JOIN maestados
          ON maclient_dir.cestado = maestados.cestado
         AND COALESCE(maclient_dir.cpais, 58) = maestados.cpais
        LEFT JOIN maciudades
          ON maclient_dir.cestado = maciudades.cestado
         AND maclient_dir.cciudad = maciudades.cciudad
        LEFT JOIN maclient_tel
          ON maclient.cci_rif = maclient_tel.cci_rif
        LEFT JOIN maclient_atr
          ON maclient.cci_rif = maclient_atr.cci_rif
        LEFT JOIN maprofes
          ON maclient_atr.cprofesion = maprofes.cprofesion
        LEFT JOIN maocupac
          ON maclient_atr.cocupacion = maocupac.cocupacion
        LEFT JOIN maactivi
          ON maclient_atr.cactividad = maactivi.cactividad
        WHERE
          LTRIM(RTRIM(CONVERT(VARCHAR(30), maclient.cci_rif))) = @cciRif
          OR LTRIM(RTRIM(CONVERT(VARCHAR(30), maclient.cid))) IN (@cidRaw, @cidDigits, @cidLetter)
          OR LTRIM(RTRIM(CONVERT(VARCHAR(30), maclient.cid))) LIKE '[VEJPGvejpg]' + @cciRif
      `);

      const row = result.recordset?.[0] as Record<string, unknown> | undefined;
      if (!row) {
        throw new NotFoundException('Propietario no encontrado');
      }

      // `data` = envelope Nest; `info` = compat con respuesta Express SysIP
      return { status: true as const, data: row, info: row };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`searchNewProprietary: ${msg}`);
      throw new InternalServerErrorException('Error al buscar propietario.');
    }
  }

  /** Ramo externo BINAC* en maplanes (srv001: 26; SysIP legacy: 28). */
  private resolveRamoBinacional(): number {
    return parseInt(this.config.get<string>('LAMUNDIAL_RAMO_BINACIONAL', '28') ?? '28', 10);
  }

  /** cramo del plan vigente en maplanes (null si no existe). BINAC* prioriza LAMUNDIAL_RAMO_BINACIONAL. */
  private async resolvePlanCramo(cplan: string): Promise<number | null> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('cplan', T.VarChar(10), cplan);
    const ramoBinac = this.resolveRamoBinacional();
    const orderBinacFirst = /^BINAC/i.test(cplan)
      ? `ORDER BY CASE WHEN cramo = ${ramoBinac} THEN 0 WHEN cramo = 18 THEN 1 ELSE 2 END`
      : '';
    const result = await req.query(`
      SELECT TOP 1 cramo FROM maplanes WHERE cplan = @cplan AND iestado = 'V'
      ${orderBinacFirst}
    `);
    const row = result.recordset?.[0] as { cramo?: number } | undefined;
    if (row?.cramo == null) return null;
    return Number(row.cramo);
  }

  private isBinacAutoEmission(b: Record<string, unknown>): boolean {
    const cplan = String(this.pick(b, 'cplan', 'plan') ?? '').trim();
    if (/^BINAC/i.test(cplan)) return true;
    const iplaca = String(this.pick(b, 'iplaca', 'tipo_placa') ?? 'N').trim().toUpperCase();
    if (iplaca === 'B') return true;
    return this.intField(this.pick(b, 'cramo', 'ramo')) === this.resolveRamoBinacional();
  }

  /** spee_validate_automovil_general_nexus en Sis2000 debe aceptar ramo 28 (BINAC*). */
  private throwIfBinacEmissionBlockedBySis2000(
    b: Record<string, unknown>,
    spMessage: string,
  ): void {
    if (!this.isBinacAutoEmission(b)) return;
    const lower = spMessage.toLowerCase();
    if (!lower.includes('ramo no corresponde')) return;
    throw new BadRequestException(
      'Emisión binacional bloqueada por spee_validate_automovil_general_nexus en Sis2000 (debe aceptar ramo 28). ' +
        'Referencia: docs/sql/spee_validate_automovil_general_nexus.sql',
    );
  }

  private validateEmissionAutoFailure(raw: string) {
    const formatted = formatValidateAutoError(raw);
    this.logger.warn(`validateEmissionAuto: ${raw} → ${formatted.code}`);
    return { status: false as const, error: formatted.message, code: formatted.code };
  }

  /** BINAC* (ramo 28): validar placa/serial sin depender del SP nexus hasta que DBA acepte ramo 28. */
  private shouldValidateEmissionAutoViaLegacySp(cplan: string, cramo: number): boolean {
    if (/^BINAC/i.test(cplan)) return false;
    const ramoNacional = parseInt(this.config.get<string>('LAMUNDIAL_RAMO', '18') ?? '18', 10);
    return cramo === ramoNacional;
  }

  private async validateEmissionAutoInline(
    placa: unknown,
    serialCarroceria: unknown,
  ): Promise<{ ok: true } | { ok: false; raw: string }> {
    const xplaca = String(placa ?? '').trim();
    const xsercar = String(serialCarroceria ?? '').trim();

    if (!xplaca) return { ok: false, raw: 'Placa no debe estar vacío' };
    if (!xsercar) return { ok: false, raw: 'Serial de Carrocería no debe estar vacío' };

    const T = this.db.types;

    const placaReq = this.db.request();
    placaReq.input('xplaca', T.VarChar(15), xplaca);
    const placaResult = await placaReq.query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM vhcerti
        WHERE xplaca = @xplaca AND istatcer = 'V' AND fhasta >= GETDATE()
      ) THEN 1 ELSE 0 END AS existsPlaca
    `);
    if (Number(placaResult.recordset?.[0]?.['existsPlaca'])) {
      return {
        ok: false,
        raw: 'Se ha detectado la existencia de una póliza vigente la misma placa del vehículo.',
      };
    }

    const serialReq = this.db.request();
    serialReq.input('xsercar', T.VarChar(60), xsercar);
    const serialResult = await serialReq.query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM vhcerti
        WHERE xsercar = @xsercar AND istatcer = 'V' AND fhasta >= GETDATE()
      ) THEN 1 ELSE 0 END AS existsSerial
    `);
    if (Number(serialResult.recordset?.[0]?.['existsSerial'])) {
      return {
        ok: false,
        raw: 'Se ha detectado la existencia de una póliza vigente con el mismo Serial Carrocería del Vehículo.',
      };
    }

    return { ok: true };
  }

  async validateEmissionAuto(body: Record<string, unknown>) {
    const defaultPlan = this.config.get<string>('LAMUNDIAL_PLAN_DEFAULT', 'RCVBAS');
    const cplan = String(body.plan ?? defaultPlan).trim() || defaultPlan;

    let cramo: number | null;
    try {
      cramo = await this.resolvePlanCramo(cplan);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`validateEmissionAuto resolvePlanCramo: ${msg}`);
      throw new InternalServerErrorException('Error al validar el plan del vehículo.');
    }

    if (cramo == null) {
      return this.validateEmissionAutoFailure('Plan enviado no se encuentra registrado.');
    }

    if (!this.shouldValidateEmissionAutoViaLegacySp(cplan, cramo)) {
      try {
        this.logger.log(`validateEmissionAuto inline plan=${cplan} cramo=${cramo}`);
        const inline = await this.validateEmissionAutoInline(body.placa, body.serial_carroceria);
        if (!inline.ok) return this.validateEmissionAutoFailure(inline.raw);
        return {
          status: true,
          message: 'El vehículo puede asegurarse. No hay póliza vigente con esta placa ni serial.',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`validateEmissionAuto inline plan=${cplan}: ${msg}`);
        throw new InternalServerErrorException('Error al validar el vehículo para emisión.');
      }
    }

    const req = this.db.request();
    const T = this.db.types;
    req.input('cplan', T.VarChar(10), cplan);
    req.input('xplaca', T.VarChar(15), body.placa);
    req.input('xsercar', T.VarChar(60), body.serial_carroceria);
    req.input('xsermot', T.VarChar(60), null);
    try {
      this.logger.log(`validateEmissionAuto EXEC ${SP_VALIDATE_AUTOMOVIL_LEGACY} plan=${cplan} cramo=${cramo}`);
      await req.execute(SP_VALIDATE_AUTOMOVIL_LEGACY);
      return {
        status: true,
        message: 'El vehículo puede asegurarse. No hay póliza vigente con esta placa ni serial.',
      };
    } catch (err) {
      const raw = parseSPError(err);
      return this.validateEmissionAutoFailure(raw);
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

      this.flattenConductorBeneficiario(b);
      this.normalizeEmissionBodyAliases(b);

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

  /**
   * Emision-Plan envía conductor/beneficiario anidados; el SP espera columnas planas
   * (@icedula_conductor, @xrif_beneficiario, …). Sin esto TMEMISION queda en NULL.
   */
  private flattenConductorBeneficiario(b: Record<string, unknown>): void {
    for (const key of ['conductor', 'beneficiario'] as const) {
      const raw = b[key];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
        if (b[field] == null && value != null && String(value).trim() !== '') {
          b[field] = value;
        }
      }
    }
  }

  /** Alias Emision-Plan / SSO → nombres que lee el SP. */
  private normalizeEmissionBodyAliases(b: Record<string, unknown>): void {
    if (b['productor'] != null && b['cproductor'] == null) {
      b['cproductor'] = b['productor'];
    }
    if (b['ccanalalt_in'] != null && b['ccanalalt'] == null) {
      b['ccanalalt'] = b['ccanalalt_in'];
    }
    if (b['cscanalalt_in'] != null && b['cscanalalt'] == null) {
      b['cscanalalt'] = b['cscanalalt_in'];
    }
    if (b['frecuencia'] != null && b['ifrecuencia'] == null) {
      b['ifrecuencia'] = b['frecuencia'];
    }
    if (b['tasa_ca'] != null && b['tasaCa'] == null) b['tasaCa'] = b['tasa_ca'];
    if (b['tasa_pt'] != null && b['tasaPt'] == null) b['tasaPt'] = b['tasa_pt'];
    if (b['tasa_pp'] != null && b['tasaPp'] == null) b['tasaPp'] = b['tasa_pp'];
  }

  private char1(value: unknown): string | null {
    if (value == null || String(value).trim() === '') return null;
    return String(value).trim().charAt(0).toUpperCase();
  }

  private rifNumeric(value: unknown): number | null {
    if (value == null || String(value).trim() === '') return null;
    const n = Number(String(value).replace(/\D/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Beneficiario preferencial anidado (createEmissionAuto / policyMapper). */
  private extractBeneficiario(b: Record<string, unknown>): Record<string, unknown> | null {
    const raw = b['beneficiario'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      // También aceptar campos ya aplanados en el body
      const rif = b['xrif_beneficiario'] ?? b['rif_beneficiario'];
      if (rif == null || String(rif).replace(/\D/g, '') === '') return null;
      return b;
    }
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
    await macReq.execute('sp_create_maclient_nexus');

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
    this.flattenConductorBeneficiario(b);
    this.normalizeEmissionBodyAliases(b);
    const T = this.db.types;
    const ptasamon = this.resolvePtasamon(b);
    const { mprima, cmoneda: planMoneda } = await this.resolveMprimaForSp(b);
    this.logEmissionPrima(b, mprima, planMoneda);
    const defaultRamo = parseInt(this.config.get<string>('LAMUNDIAL_RAMO', '18') ?? '18', 10);
    const femision =
      this.pick<string>(b, 'fecha_emision', 'femision') ??
      new Date().toISOString().slice(0, 10);

    const req = this.db.request();
    const params: Record<string, { type: unknown; value: unknown }> = {
      // Emisión nueva RCV: cnpoliza_rel vacío; Sis2000 genera cnpoliza.
      cnpoliza_rel: {
        type: T.NVarChar(30),
        value: null,
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
      // Conductor / beneficiario (payload anidado ya aplanado en createEmissionAuto)
      icedula_conductor: {
        type: T.Char(1),
        value: this.char1(this.pick(b, 'icedula_conductor')),
      },
      xrif_conductor: {
        type: T.Numeric(13, 0),
        value: this.rifNumeric(this.pick(b, 'xrif_conductor', 'rif_conductor')),
      },
      xnombre_conductor: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xnombre_conductor', 'nombre_conductor') ?? null,
      },
      xapellido_conductor: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xapellido_conductor', 'apellido_conductor') ?? null,
      },
      isexo_conductor: {
        type: T.Char(1),
        value: this.char1(this.pick(b, 'isexo_conductor', 'sexo_conductor')),
      },
      iestado_civil_conductor: {
        type: T.Char(1),
        value: this.char1(this.pick(b, 'iestado_civil_conductor', 'estado_civil_conductor')),
      },
      fnac_conductor: {
        type: T.Date,
        value: this.pick(b, 'fnac_conductor') ?? null,
      },
      cestado_conductor: {
        type: T.VarChar(100),
        value: String(this.pick(b, 'cestado_conductor', 'estado_conductor') ?? ''),
      },
      cciudad_conductor: {
        type: T.VarChar(100),
        value: String(this.pick(b, 'cciudad_conductor', 'ciudad_conductor') ?? ''),
      },
      xdireccion_conductor: {
        type: T.NVarChar(1000),
        value: this.pick(b, 'xdireccion_conductor', 'direccion_conductor') ?? null,
      },
      xtelefono_conductor: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xtelefono_conductor', 'telefono_conductor') ?? null,
      },
      xcorreo_conductor: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xcorreo_conductor', 'correo_conductor') ?? null,
      },
      icedula_beneficiario: {
        type: T.Char(1),
        value: this.char1(this.pick(b, 'icedula_beneficiario')),
      },
      xrif_beneficiario: {
        type: T.Numeric(13, 0),
        value: this.rifNumeric(this.pick(b, 'xrif_beneficiario', 'rif_beneficiario')),
      },
      xnombre_beneficiario: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xnombre_beneficiario', 'nombre_beneficiario') ?? null,
      },
      xapellido_beneficiario: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xapellido_beneficiario', 'apellido_beneficiario') ?? null,
      },
      isexo_beneficiario: {
        type: T.Char(1),
        value: this.char1(this.pick(b, 'isexo_beneficiario', 'sexo_beneficiario')),
      },
      iestado_civil_beneficiario: {
        type: T.Char(1),
        value: this.char1(
          this.pick(b, 'iestado_civil_beneficiario', 'estado_civil_beneficiario'),
        ),
      },
      fnac_beneficiario: {
        type: T.Date,
        value: this.pick(b, 'fnac_beneficiario') ?? null,
      },
      cestado_beneficiario: {
        type: T.VarChar(100),
        value: String(this.pick(b, 'cestado_beneficiario', 'estado_beneficiario') ?? ''),
      },
      cciudad_beneficiario: {
        type: T.VarChar(100),
        value: String(this.pick(b, 'cciudad_beneficiario', 'ciudad_beneficiario') ?? ''),
      },
      xdireccion_beneficiario: {
        type: T.NVarChar(1000),
        value: this.pick(b, 'xdireccion_beneficiario', 'direccion_beneficiario') ?? null,
      },
      xtelefono_beneficiario: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xtelefono_beneficiario', 'telefono_beneficiario') ?? null,
      },
      xcorreo_beneficiario: {
        type: T.NVarChar(250),
        value: this.pick(b, 'xcorreo_beneficiario', 'correo_beneficiario') ?? null,
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
        value: this.intField(this.pick(b, 'ccanalalt', 'ccanalalt_in')),
      },
      cscanalalt: {
        type: T.Int,
        value: this.intField(this.pick(b, 'cscanalalt', 'cscanalalt_in')),
      },
      cusuario: {
        type: T.Numeric(13, 0),
        value: this.intField(this.pick(b, 'cusuario')) ?? null,
      },
      ptasamon_pago: { type: T.Numeric(18, 6), value: ptasamon },
      cmoneda: {
        type: T.Char(4),
        value: planMoneda ? String(planMoneda).slice(0, 4) : null,
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
      itipoEmi: {
        type: T.VarChar(10),
        value: this.pick(b, 'itipoEmi') ?? 'NU',
      },
      coberAdicional: {
        type: T.VarChar(2),
        value: this.pick(b, 'coberAdicional', 'cober_adicional') ?? 'RC',
      },
      tasaPt: {
        type: T.Numeric(18, 2),
        value: this.pick(b, 'tasaPt', 'tasa_pt') ?? 0,
      },
      tasaCa: {
        type: T.Numeric(18, 2),
        value: this.pick(b, 'tasaCa', 'tasa_ca') ?? 0,
      },
      tasaPp: {
        type: T.Numeric(18, 2),
        value: this.pick(b, 'tasaPp', 'tasa_pp') ?? 0,
      },
      itipo_diligencia: {
        type: T.Char(1),
        value: this.pick(b, 'itipo_diligencia', 'itipoDiligencia') ?? null,
      },
      cprofesion_tomador: {
        type: T.Int,
        value: this.intField(this.pick(b, 'cprofesion_tomador')) ?? null,
      },
      cactividad_tomador: {
        type: T.Int,
        value: this.intField(this.pick(b, 'cactividad_tomador')) ?? null,
      },
      cprofesion_titular: {
        type: T.Int,
        value: this.intField(this.pick(b, 'cprofesion_titular')) ?? null,
      },
      cactividad_titular: {
        type: T.Int,
        value: this.intField(this.pick(b, 'cactividad_titular')) ?? null,
      },
      fdesde: { type: T.Date, value: b['fdesde'] },
      fhasta: { type: T.Date, value: b['fhasta'] },
    };

    Object.entries(params).forEach(([key, field]) =>
      req.input(key, (field as { type: unknown }).type, (field as { value: unknown }).value),
    );

    const xplaca = String(this.pick(b, 'xplaca', 'placa') ?? '').trim();
    const preEmisionSp = SP_PRE_EMISION_AUTO_RCV;
    this.logger.log(
      `emitLocal: EXEC ${preEmisionSp} placa=${xplaca} plan=${b['cplan'] ?? b['plan']} mprima=${mprima} cmoneda=${planMoneda ?? 'null'} ifrecuencia=${this.pick(b, 'ifrecuencia', 'frecuencia') ?? 'A'} msumaaseg=${this.pick(b, 'msumaaseg', 'sumaaseg') ?? 'null'} fhasta=${b['fhasta'] ?? 'null'} ptasamon=${ptasamon}`,
    );
    // TEMP debug: payload completo enviado al SP (quitar cuando ya no se necesite).
    const spPayload = Object.fromEntries(
      Object.entries(params).map(([key, field]) => {
        const value = (field as { value: unknown }).value;
        if (value instanceof Date) return [key, value.toISOString()];
        return [key, value];
      }),
    );
    this.logger.log(`emitLocal SP params ${preEmisionSp}: ${JSON.stringify(spPayload)}`);

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
      this.throwIfBinacEmissionBlockedBySis2000(b, msg);
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
    const pdfBase =
      this.config.get<string>('POLICY_PDF_URL') ?? this.config.get<string>('URLPoliza');
    const urlpoliza = buildPolicyPdfUrl(pdfBase, cnpoliza, fanopol, fmespol);
    const url_club_arys = await this.resolveClubArysPdfForEmission(cnpoliza, b);

    this.logger.log(`emitLocal OK cnpoliza=${cnpoliza} cnrecibo=${cnrecibo}`);

    await this.repairRcvCoberturasIfEmpty(cnpoliza);

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
      url_club_arys: url_club_arys || undefined,
      ncuota,
      fanopol,
      fmespol,
    };
  }

  /** Si adpolcob quedó sin prima (plan premium Auto), re-ejecuta spCalculoAuto vía repair SP. */
  private async repairRcvCoberturasIfEmpty(cnpoliza: string): Promise<void> {
    const poliza = String(cnpoliza ?? '').trim();
    if (!poliza) return;

    const T = this.db.types;
    const check = this.db.request();
    check.input('cnpoliza', T.NVarChar(30), poliza);
    const existing = await check.query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM adpolcob c
        INNER JOIN adrecibos r ON r.crecibo = c.crecibo
        INNER JOIN adpoliza p ON p.cpoliza = r.cpoliza
        WHERE RTRIM(p.cnpoliza) = RTRIM(@cnpoliza) AND c.mprimabruta > 0
      ) THEN 1 ELSE 0 END AS hasPrima
    `);
    if (Number(existing.recordset?.[0]?.['hasPrima'] ?? 0) === 1) return;

    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), poliza);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(4000));
      const result = await req.execute(SP_REPAIR_RCV_COBERTURAS);
      const ok = result.output['pSuccess'] === true;
      if (!ok) {
        const msg = String(result.output['pErrorMessage'] ?? 'repair falló');
        this.logger.warn(`repairRcvCoberturas cnpoliza=${poliza}: ${msg}`);
        return;
      }
      this.logger.log(`repairRcvCoberturas OK cnpoliza=${poliza}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`repairRcvCoberturas omitido cnpoliza=${poliza}: ${msg}`);
    }
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
      const cnpoliza = String(dataObj['poliza'] ?? dataObj['cnpoliza'] ?? '');
      const url_club_arys = cnpoliza
        ? await this.resolveClubArysPdfForEmission(cnpoliza, b)
        : '';
      return {
        message: (resData['message'] as string) || 'Emisión registrada via API externa.',
        cnpoliza,
        cnrecibo: String(dataObj['recibo'] ?? dataObj['cnrecibo'] ?? ''),
        urlpoliza: String(dataObj['urlpoliza'] ?? ''),
        url_club_arys: url_club_arys || undefined,
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
