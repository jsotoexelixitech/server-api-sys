import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXELIXI_PARTNER_HOST, ExelixiPartnerHost } from '@jsotoexelixitech/nest-api-sdk';
import { MssqlService } from '../database/mssql.service';
import { PrismaService } from '../database/prisma/prisma.service';
import { queryMaclientApi } from '../modules/auth/api-key-db.support';
import { getCurrentNestAuth } from '../modules/auth/nest-request-auth.context';
import { bindPartnerHostRef } from './partner-host-bridge';

/** Claves de entorno que un partner puede leer vía host (sin secretos de BD). */
const PARTNER_CONFIG_WHITELIST = new Set([
  'NODE_ENV',
  'PUBLIC_API_ORIGIN',
  'LAMUNDIAL_PRODUCTOR',
  'LAMUNDIAL_CUSUARIO',
  /** Preferido: canal de la API key del request; env solo como fallback. */
  'CANAL_VENTA',
]);

@Injectable()
export class PartnerHostService implements ExelixiPartnerHost, OnModuleInit {
  private readonly logger = new Logger(PartnerHostService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mssql: MssqlService,
  ) { }

  onModuleInit(): void {
    bindPartnerHostRef(this);
  }

  getConfig(key: string): string | undefined {
    if (key === 'CANAL_VENTA' || key === 'XCANAL_VENTA') {
      const auth = getCurrentNestAuth();
      const fromKey = auth?.xcanalVenta?.trim();
      if (fromKey) return fromKey;
      // eslint-disable-next-line no-console -- diagnóstico visible en pm2 logs
      console.warn(
        `[PartnerHost] CANAL_VENTA vacío apiKeyId=${auth?.apiKeyId ?? 'n/a'} via=${auth?.via ?? 'n/a'} xcanal=${JSON.stringify(auth?.xcanalVenta ?? null)}`,
      );
      const fromEnv =
        this.config.get<string>('CANAL_VENTA') ?? process.env.CANAL_VENTA;
      const trimmed = fromEnv?.trim();
      return trimmed || undefined;
    }

    if (!PARTNER_CONFIG_WHITELIST.has(key)) {
      this.logger.warn(`Partner solicitó config no permitida: ${key}`);
      return undefined;
    }
    const value = this.config.get<string>(key);
    return value != null ? String(value) : undefined;
  }

  log(level: 'log' | 'warn' | 'error', message: string, context?: string): void {
    const scoped = new Logger(context ?? 'Partner');
    scoped[level](message);
  }

  /**
   * Cliente API (maclient_api) por canal de venta. La tabla vive en Sis2000 (SQL Server);
   * antes se buscaba en el PostgreSQL de nest-api (public.maclient_api), que no existe en QA
   * ni en producción y hacía fallar las rutas de partners con 500. Prisma queda solo de respaldo.
   */
  async queryMaclientApi(canal_venta: string): Promise<Record<string, any> | null> {
    const canal = String(canal_venta ?? '').trim();
    if (!canal) return null;
    try {
      const req = this.mssql.request();
      req.input('xcanal_venta', this.mssql.types.VarChar(100), canal.substring(0, 100));
      const r = await req.query('SELECT TOP 1 * FROM dbo.maclient_api WHERE xcanal_venta = @xcanal_venta');
      const row = (r.recordset?.[0] as Record<string, any> | undefined) ?? null;
      // eslint-disable-next-line no-console -- diagnóstico pm2
      console.warn(`[PartnerHost] queryMaclientApi canal=${JSON.stringify(canal)} found=${row != null} fuente=sis2000`);
      return row;
    } catch (err) {
      this.logger.warn(`queryMaclientApi en Sis2000 falló (${err instanceof Error ? err.message : 'error'}); se intenta PostgreSQL`);
    }
    try {
      return await queryMaclientApi(this.prisma, canal);
    } catch {
      return null;
    }
  }
}


@Global()
@Module({
  providers: [
    PartnerHostService,
    { provide: EXELIXI_PARTNER_HOST, useExisting: PartnerHostService },
  ],
  exports: [EXELIXI_PARTNER_HOST, PartnerHostService],
})
export class PartnerHostModule { }
