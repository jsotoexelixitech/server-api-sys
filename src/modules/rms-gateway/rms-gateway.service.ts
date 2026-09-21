import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as T from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { RmsGatewayClient } from './rms-gateway.client';
import {
  RmsSiniestroEmitirDto,
  RmsSiniestroValidarDto,
} from './dto/rms-sync.dto';
import {
  buildPolizaWebhookPayload,
  parseRamosPermitidos,
  type RmsPolizaWebhookBody,
} from './rms-gateway.mapper';

/**
 * Emisor Mundial → RMS: lee la póliza ya grabada en Sis2000 (SELECT/SP)
 * y POST al webhook del gateway. No modifica SPs.
 */
@Injectable()
export class RmsGatewayService {
  private readonly logger = new Logger(RmsGatewayService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly client: RmsGatewayClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * Notifica un cambio de póliza. Nunca lanza: un fallo de RMS no revierte Sis2000.
   * `patch` pisa nombres/cédulas leídos de Sis2000 (el SP a veces no actualiza maclient.xcliente).
   */
  notifyPolizaActualizada(
    cnpoliza: string,
    patch?: Record<string, unknown>,
  ): void {
    void this.syncPoliza(cnpoliza, patch).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`RMS notify póliza ${cnpoliza} falló: ${msg}`);
    });
  }

  async syncPoliza(
    cnpoliza: string,
    patch?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.client.isEnabled()) return;
    const poliza = String(cnpoliza ?? '').trim();
    if (!poliza) return;

    const loaded = await this.loadPoliza(poliza);
    if (!loaded) {
      this.logger.warn(`RMS notify: Sis2000 sin póliza ${poliza}`);
      return;
    }
    const row = { ...loaded, ...(patch ?? {}) };
    const cramo = Number(row['cramo'] ?? row['Cramo'] ?? 0);
    if (!this.ramoPermitido(cramo)) {
      this.logger.log(`RMS notify omitido ramo=${cramo} cnpoliza=${poliza}`);
      return;
    }
    const body = buildPolizaWebhookPayload(row);
    if (!body) {
      this.logger.warn(`RMS notify: no se pudo armar payload cnpoliza=${poliza}`);
      return;
    }
    const result = await this.client.postPolizas(
      body,
      `nest-poliza-${poliza}-${Date.now()}`,
    );
    this.logger.log(`RMS notify OK cnpoliza=${poliza} resultado=${JSON.stringify(result)}`);
  }

  /**
   * Avisa un cambio de siniestro ya emitido en RMS. Nunca lanza.
   * No crea siniestros nuevos (eso es POST /siniestros/emitir del gateway).
   */
  notifySiniestroActualizado(body: Record<string, unknown>): void {
    void this.syncSiniestro(body).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      const cn = String(body['cnpoliza'] ?? '');
      this.logger.warn(`RMS notify siniestro ${cn} falló: ${msg}`);
    });
  }

  async syncSiniestro(body: Record<string, unknown>): Promise<unknown> {
    if (!this.client.isEnabled()) return null;
    const cnpoliza = String(body['cnpoliza'] ?? '').trim();
    if (!cnpoliza) {
      this.logger.warn('RMS notify siniestro: cnpoliza vacío');
      return null;
    }
    const payload = {
      evento: String(body['evento'] ?? 'siniestro.actualizado'),
      ...body,
      cnpoliza,
    };
    const result = await this.client.postSiniestros(
      payload,
      `nest-siniestro-${cnpoliza}-${Date.now()}`,
    );
    this.logger.log(
      `RMS notify siniestro OK cnpoliza=${cnpoliza} resultado=${JSON.stringify(result)}`,
    );
    return result;
  }

  /** POST al webhook el snapshot que armó el SP (personas + coberturas). */
  async syncPayload(body: RmsPolizaWebhookBody, cnpoliza: string): Promise<void> {
    if (!this.client.isEnabled()) {
      throw new Error('RMS gateway deshabilitado o sin URL/secreto');
    }
    if (!body?.poliza_detalle) {
      throw new Error(`payload_json sin poliza_detalle cnpoliza=${cnpoliza}`);
    }
    const poliza = String(cnpoliza ?? '').trim();
    const result = await this.client.postPolizas(
      body,
      `nest-evento-${poliza}-${Date.now()}`,
    );
    this.logger.log(
      `RMS notify payload OK cnpoliza=${poliza} resultado=${JSON.stringify(result)}`,
    );
  }

  private ramoPermitido(cramo: number): boolean {
    const allow = parseRamosPermitidos(
      this.config.get<string>('RMS_GATEWAY_RAMOS') ?? '5,7,8,9,45',
    );
    if (!allow.size) return cramo !== 18;
    return allow.has(cramo);
  }

  /**
   * Solo personas: tomador, titular/asegurado y beneficiario.
   * No usa el SP de endosos (ese hace join a mamarca / vehículo).
   */
  async loadPolizaRow(cnpoliza: string): Promise<Record<string, unknown> | null> {
    const req = this.db.request();
    req.input('cnpoliza', T.NVarChar(30), cnpoliza);
    const res = await req.query(`
      SELECT TOP 1
        LTRIM(RTRIM(p.cnpoliza)) AS cnpoliza,
        p.cpoliza,
        p.cramo,
        p.fanopol,
        p.fmespol,
        p.iestado,
        p.ctenedor,
        p.casegurado,
        p.cbeneficiario,
        CONVERT(varchar(10), p.fdesde, 23) AS fdesde,
        CONVERT(varchar(10), p.fhasta, 23) AS fhasta,
        t.cci_rif AS cci_rif_tomador,
        LTRIM(RTRIM(t.cid)) AS cid_tomador,
        LEFT(LTRIM(RTRIM(t.cid)), 1) AS icedula_tomador,
        t.ipersona AS ipersona_tomador,
        t.xcliente AS xtomador,
        s.cci_rif AS cci_rif_aseg,
        LTRIM(RTRIM(s.cid)) AS cid_aseg,
        LEFT(LTRIM(RTRIM(s.cid)), 1) AS icedula_aseg,
        s.ipersona AS ipersona_aseg,
        s.xcliente AS xasegurado,
        b.cci_rif AS cci_rif_ben,
        LTRIM(RTRIM(b.cid)) AS cid_ben,
        LEFT(LTRIM(RTRIM(b.cid)), 1) AS icedula_ben,
        b.ipersona AS ipersona_ben,
        b.xcliente AS xbeneficiario
      FROM adpoliza p
      LEFT JOIN maclient t ON t.cci_rif = p.ctenedor
      LEFT JOIN maclient s ON s.cci_rif = p.casegurado
      LEFT JOIN maclient b ON b.cci_rif = p.cbeneficiario
      WHERE LTRIM(RTRIM(p.cnpoliza)) = LTRIM(RTRIM(@cnpoliza))
      ORDER BY p.fanopol DESC, p.fmespol DESC
    `);
    return (res.recordset?.[0] as Record<string, unknown> | undefined) ?? null;
  }

  /**
   * Precheck Sis2000 para RMS. HTTP 400 (vía excepción) si no se puede emitir:
   * póliza, vigencia y recibo cobrado en la fecha de ocurrencia.
   */
  async validarSiniestro(dto: RmsSiniestroValidarDto) {
    const chequeo = await this.assertSiniestroPuedeEmitirse(
      dto.cnpoliza,
      dto.focurrencia,
    );
    return {
      status: 'ok',
      cerror: 0,
      cnpoliza: chequeo.cnpoliza,
      iestado: chequeo.iestado,
      fdesde: chequeo.fdesde,
      fhasta: chequeo.fhasta,
      recibo_cobrado: chequeo.reciboCobrado,
    };
  }

  /**
   * Alta real en Sis2000 (`spGeneraSiniestro`). Si el SP rechaza (recibos
   * pendientes, etc.) lanza 400 para que jws haga rollback del siniestro RMS.
   */
  async emitirSiniestro(dto: RmsSiniestroEmitirDto) {
    const focur = String(dto.focurencia || dto.focurrencia || '').trim();
    const chequeo = await this.assertSiniestroPuedeEmitirse(dto.cnpoliza, focur);

    const existente = await this.buscarSiniestroExistente(chequeo.cnpoliza, focur);
    if (existente) {
      this.logger.log(
        `emitir siniestro idempotente cnpoliza=${chequeo.cnpoliza} cnsinies=${existente.cnsinies}`,
      );
      return {
        status: 'ok',
        cerror: 0,
        cnpoliza: chequeo.cnpoliza,
        csinies: existente.csinies,
        cnsinies: existente.cnsinies,
        csiniestro: existente.cnsinies,
        mensaje: 'ya existía en Sis2000',
      };
    }

    const fnoti = this.parseFecha(dto.fnotificacion) ?? new Date();
    const focc = this.parseFecha(focur) ?? fnoti;
    const req = this.db.request();
    req.input('cnpoliza', T.NVarChar(30), chequeo.cnpoliza);
    req.input('fnotificacion', T.DateTime, fnoti);
    req.input('focurencia', T.DateTime, focc);
    req.input('ccausa', T.Int, Number(dto.ccausa ?? 0));
    req.input('asegurado', T.NVarChar(40), String(dto.asegurado || '').trim());
    req.input('cmoneda', T.NVarChar(4), this.normalizarMoneda(dto.cmoneda));
    req.input('cpais', T.Int, Number(dto.cpais ?? 58));
    req.input('cestado', T.Int, Number(dto.cestado ?? 1));
    req.input('cciudad', T.Int, Number(dto.cciudad ?? 1));
    req.input('xobserva', T.NVarChar(250), String(dto.xobserva || '').slice(0, 250));
    req.input('mmontosiniestro', T.Numeric(18, 2), Number(dto.mmontosiniestro ?? 0));
    req.input('itiposiniestro', T.Char(1), String(dto.itiposiniestro || 'S').slice(0, 1));
    req.input('cusuario', T.Int, Number(dto.cusuario ?? 999));
    req.output('csinies', T.Numeric(19, 0));
    req.output('cnsinies', T.Char(30));
    req.output('cerror', T.Int);
    req.output('msj', T.VarChar(255));

    const res = await req.execute('spGeneraSiniestro');
    const out = (res.output ?? {}) as Record<string, unknown>;
    const cerror = Number(out.cerror ?? 0);
    const msj = String(out.msj ?? '').trim();
    if (cerror !== 0) {
      throw new BadRequestException(msj || `spGeneraSiniestro cerror=${cerror}`);
    }
    const cnsinies = String(out.cnsinies ?? '').trim();
    const csinies = out.csinies ?? 0;
    if (!cnsinies) {
      throw new BadRequestException('spGeneraSiniestro no devolvió cnsinies');
    }
    this.logger.log(
      `spGeneraSiniestro OK cnpoliza=${chequeo.cnpoliza} cnsinies=${cnsinies}`,
    );
    return {
      status: 'ok',
      cerror: 0,
      cnpoliza: chequeo.cnpoliza,
      csinies,
      cnsinies,
      csiniestro: cnsinies,
      mensaje: msj || 'aceptado',
    };
  }

  private async assertSiniestroPuedeEmitirse(
    cnpolizaRaw: string,
    focurrenciaRaw?: string,
  ): Promise<{
    cnpoliza: string;
    iestado: string;
    fdesde: string;
    fhasta: string;
    reciboCobrado: string | null;
  }> {
    const cnpoliza = String(cnpolizaRaw || '').trim();
    if (!cnpoliza) {
      throw new BadRequestException('cnpoliza vacío');
    }
    const row = await this.loadPolizaRow(cnpoliza);
    if (!row) {
      throw new BadRequestException(`póliza no existe en Sis2000 (${cnpoliza})`);
    }
    const iestado = String(row['iestado'] ?? '').trim().toUpperCase();
    if (iestado && iestado !== 'V') {
      throw new BadRequestException(`póliza inactiva (${iestado})`);
    }
    const fdesde = String(row['fdesde'] ?? '').trim();
    const fhasta = String(row['fhasta'] ?? '').trim();
    const focur = String(focurrenciaRaw || '').trim().slice(0, 10);
    if (focur && /^\d{4}-\d{2}-\d{2}$/.test(focur)) {
      if (fdesde && focur < fdesde) {
        throw new BadRequestException(
          `fecha de ocurrencia ${focur} anterior a la vigencia (${fdesde})`,
        );
      }
      if (fhasta && focur > fhasta) {
        throw new BadRequestException(
          `fecha de ocurrencia ${focur} posterior a la vigencia (${fhasta})`,
        );
      }
    }
    const recibo = await this.resolverReciboCobertura(
      cnpoliza,
      Number(row['cpoliza'] ?? 0),
      focur,
    );
    return {
      cnpoliza,
      iestado: iestado || 'V',
      fdesde,
      fhasta,
      reciboCobrado: recibo,
    };
  }

  private async resolverReciboCobertura(
    cnpoliza: string,
    cpoliza: number,
    focur: string,
  ): Promise<string | null> {
    const req = this.db.request();
    req.input('cnpoliza', T.NVarChar(30), cnpoliza);
    req.input('cpoliza', T.Numeric(19, 0), cpoliza || null);
    req.input('focur', T.VarChar(10), focur || null);
    const res = await req.query(`
      SELECT
        LTRIM(RTRIM(cnrecibo)) AS cnrecibo,
        LTRIM(RTRIM(iestadorec)) AS iestadorec
      FROM adrecibos
      WHERE iestadorec <> 'A'
        AND (
          LTRIM(RTRIM(cnpoliza)) = LTRIM(RTRIM(@cnpoliza))
          OR (@cpoliza IS NOT NULL AND cpoliza = @cpoliza)
        )
        AND (
          @focur IS NULL OR @focur = ''
          OR CONVERT(date, @focur) BETWEEN CONVERT(date, fdesde) AND CONVERT(date, fhasta)
        )
      ORDER BY CASE LTRIM(RTRIM(iestadorec)) WHEN 'C' THEN 0 WHEN 'P' THEN 1 ELSE 2 END
    `);
    const rows = (res.recordset ?? []) as Array<{
      cnrecibo?: string;
      iestadorec?: string;
    }>;
    if (!rows.length && focur) {
      throw new BadRequestException(
        `no hay recibo que cubra la fecha de ocurrencia ${focur}`,
      );
    }
    const pendientes = rows
      .filter((r) => String(r.iestadorec || '').trim() === 'P')
      .map((r) => String(r.cnrecibo || '').trim())
      .filter(Boolean);
    if (pendientes.length) {
      throw new BadRequestException(
        `La póliza posee recibos pendiente para la fecha de ocurrencia del siniestro (${pendientes.join(', ')})`,
      );
    }
    const cobrado = rows.find((r) => String(r.iestadorec || '').trim() === 'C');
    return cobrado ? String(cobrado.cnrecibo || '').trim() : null;
  }

  private async buscarSiniestroExistente(
    cnpoliza: string,
    focurRaw: string,
  ): Promise<{ cnsinies: string; csinies: unknown } | null> {
    const focur = String(focurRaw || '').trim().slice(0, 10);
    if (!focur) return null;
    const req = this.db.request();
    req.input('cnpoliza', T.NVarChar(30), cnpoliza);
    req.input('focur', T.VarChar(10), focur);
    const res = await req.query(`
      SELECT TOP 1
        LTRIM(RTRIM(cnsinies)) AS cnsinies,
        csinies
      FROM snsinies
      WHERE LTRIM(RTRIM(cnpoliza)) = LTRIM(RTRIM(@cnpoliza))
        AND CONVERT(date, focursin) = CONVERT(date, @focur)
      ORDER BY csinies DESC
    `);
    const row = res.recordset?.[0] as
      | { cnsinies?: string; csinies?: unknown }
      | undefined;
    const cnsinies = String(row?.cnsinies ?? '').trim();
    return cnsinies ? { cnsinies, csinies: row?.csinies } : null;
  }

  private parseFecha(raw?: string): Date | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const iso = s.length >= 10 ? s.slice(0, 10) : s;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private normalizarMoneda(raw?: string): string {
    const m = String(raw || 'BS').trim().toUpperCase();
    if (m === '$' || m === 'USD' || m === 'US' || m === 'DL') return '$';
    if (m === 'EUR' || m === 'EU') return 'EUR';
    return m.slice(0, 4) || 'BS';
  }

  private async loadPoliza(
    cnpoliza: string,
  ): Promise<Record<string, unknown> | null> {
    return this.loadPolizaRow(cnpoliza);
  }
}
