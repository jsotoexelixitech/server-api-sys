import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Cliente Prisma generado en un ambiente 100% separado del cliente de auth
// (nest_auth / NEST_PG_DATABASE_URL). Ver prisma-product-emission/schema.prisma.
// Se carga de forma defensiva: si aún no se corrió
// `npm run prisma:generate:product-emission`, nest-api debe seguir arrancando
// normalmente (los demás módulos / flujos de La Mundial NO deben verse afectados).
let PrismaClient: any;
let CLIENT_GENERATED = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  PrismaClient = require('../../../../generated/product-emission-client').PrismaClient;
  CLIENT_GENERATED = true;
} catch {
  PrismaClient = class {
    constructor(_opts?: unknown) {}
    async $connect() {}
    async $disconnect() {}
  };
}

/**
 * PrismaClient AISLADO del flujo de emisión genérica multi-ramo.
 * - BD propia (PRODUCT_EMISSION_DATABASE_URL), distinta de la BD de auth (nest_auth)
 *   y de Sis2000 (mssql).
 * - Cliente generado en carpeta separada (generated/product-emission-client),
 *   no comparte artefactos con @prisma/client (auth).
 * - Si PRODUCT_EMISSION_DATABASE_URL no está configurado, queda deshabilitado
 *   (no rompe el arranque de nest-api ni afecta otros módulos).
 */
@Injectable()
export class ProductEmissionPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProductEmissionPrismaService.name);
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    const url = config.get<string>('PRODUCT_EMISSION_DATABASE_URL')?.trim();
    super({
      datasources: url ? { db: { url } } : undefined,
      log:
        config.get<string>('NODE_ENV') === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
    this.enabled = Boolean(url) && CLIENT_GENERATED;

    if (Boolean(url) && !CLIENT_GENERATED) {
      this.logger.warn(
        'PRODUCT_EMISSION_DATABASE_URL configurado pero el cliente Prisma de product-emission no ha sido generado. ' +
          'Corra: npm run prisma:generate:product-emission (y prisma:migrate:product-emission).',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(
        'product-emission deshabilitado: generará documentos pero NO persistirá pólizas en BD ' +
          '(falta PRODUCT_EMISSION_DATABASE_URL o el cliente Prisma generado).',
      );
      return;
    }
    await (this as any).$connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.enabled) return;
    await (this as any).$disconnect();
  }
}
