import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXELIXI_PARTNER_HOST, ExelixiPartnerHost } from '@exelixi/nest-api-sdk';

/** Claves de entorno que un partner puede leer vía host (sin secretos de BD). */
const PARTNER_CONFIG_WHITELIST = new Set([
  'NODE_ENV',
  'PUBLIC_API_ORIGIN',
  'LAMUNDIAL_PRODUCTOR',
  'LAMUNDIAL_CUSUARIO',
]);

@Injectable()
export class PartnerHostService implements ExelixiPartnerHost {
  private readonly logger = new Logger(PartnerHostService.name);

  constructor(private readonly config: ConfigService) {}

  getConfig(key: string): string | undefined {
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
}

@Global()
@Module({
  providers: [
    PartnerHostService,
    { provide: EXELIXI_PARTNER_HOST, useExisting: PartnerHostService },
  ],
  exports: [EXELIXI_PARTNER_HOST, PartnerHostService],
})
export class PartnerHostModule {}
