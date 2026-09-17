import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as T from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { RmsGatewayClient } from './rms-gateway.client';
import {
  buildPolizaWebhookPayload,
  parseRamosPermitidos,
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
   */
  notifyPolizaActualizada(cnpoliza: string): void {
    void this.syncPoliza(cnpoliza).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`RMS notify póliza ${cnpoliza} falló: ${msg}`);
    });
  }

  async syncPoliza(cnpoliza: string): Promise<void> {
    if (!this.client.isEnabled()) return;
    const poliza = String(cnpoliza ?? '').trim();
    if (!poliza) return;

    const row = await this.loadPoliza(poliza);
    if (!row) {
      this.logger.warn(`RMS notify: Sis2000 sin póliza ${poliza}`);
      return;
    }
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

  private ramoPermitido(cramo: number): boolean {
    const allow = parseRamosPermitidos(
      this.config.get<string>('RMS_GATEWAY_RAMOS') ?? '5,7,8,9,45',
    );
    if (!allow.size) return cramo !== 18;
    return allow.has(cramo);
  }

  private async loadPoliza(
    cnpoliza: string,
  ): Promise<Record<string, unknown> | null> {
    const req = this.db.request();
    req.input('cnpoliza', T.NVarChar(50), cnpoliza);
    const res = await req.execute('sp_obtener_poliza_endosos_nexus');
    const row = res.recordsets?.[0]?.[0] as Record<string, unknown> | undefined;
    return row ?? null;
  }
}
