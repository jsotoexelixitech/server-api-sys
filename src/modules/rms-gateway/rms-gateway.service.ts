import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as T from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { RmsGatewayClient } from './rms-gateway.client';
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

  private async loadPoliza(
    cnpoliza: string,
  ): Promise<Record<string, unknown> | null> {
    return this.loadPolizaRow(cnpoliza);
  }
}
