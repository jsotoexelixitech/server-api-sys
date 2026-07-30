import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { ApiKeyService } from './api-key.service';

export type ApiChannelRow = Record<string, unknown>;

@Injectable()
export class ApiChannelService {
  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  /** Resuelve canal Sis2000 desde nest_api key o maclient_api. */
  async resolveChannel(apikey: string): Promise<ApiChannelRow> {
    const key = String(apikey ?? '').trim();
    if (!key) {
      return this.defaultChannel();
    }

    if (key.startsWith('nest_') && this.apiKeys.isEnabled()) {
      const row = await this.apiKeys.findByPlainKey(key);
      if (row) {
        return {
          cproductor:
            row.cproductor ??
            parseInt(this.config.get<string>('LAMUNDIAL_PRODUCTOR', '80080') ?? '80080', 10),
          xcanal_venta: row.xcanalVenta ?? 'ExelixiTech',
          corigen_rel: 'WE',
          ifuente_api: 'API',
          ifuente: 'API',
          cprog: 'eePoliza_PerGe',
          ctipocanal: null,
          ccanalalt: null,
          cscanalalt: null,
        };
      }
    }

    const T = this.db.types;
    const req = this.db.request();
    req.input('xtoken', T.VarChar(100), key);
    const result = await req.query(`
      SELECT TOP 1 *
      FROM maclient_api
      WHERE xtoken = @xtoken
    `);
    if (result.recordset?.length) {
      return result.recordset[0] as ApiChannelRow;
    }
    return this.defaultChannel();
  }

  /** Valida que la apikey exista cuando auth estricto está activo. */
  async assertApiKeyRegistered(apikey: string): Promise<void> {
    const key = String(apikey ?? '').trim();
    if (!key) {
      throw new Error('apikey requerida.');
    }

    if (key.startsWith('nest_') && this.apiKeys.isEnabled()) {
      const row = await this.apiKeys.findByPlainKey(key);
      if (row) return;
      throw new Error('apikey nest-api no registrada o revocada.');
    }

    const T = this.db.types;
    const req = this.db.request();
    req.input('xtoken', T.VarChar(100), key);
    const result = await req.query(`
      SELECT TOP 1 xtoken FROM maclient_api WHERE xtoken = @xtoken
    `);
    if (!result.recordset?.length) {
      throw new Error('apikey no registrada en maclient_api.');
    }
  }

  private defaultChannel(): ApiChannelRow {
    return {
      cproductor: parseInt(this.config.get<string>('LAMUNDIAL_PRODUCTOR', '80080') ?? '80080', 10),
      xcanal_venta: 'ExelixiTech',
      corigen_rel: 'WE',
      ifuente_api: 'API',
      ifuente: 'API',
      cprog: 'eePoliza_PerGe',
      ctipocanal: null,
      ccanalalt: null,
      cscanalalt: null,
    };
  }
}
