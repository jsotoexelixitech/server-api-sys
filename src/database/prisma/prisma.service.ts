import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    const url = config.get<string>('NEST_PG_DATABASE_URL')?.trim();
    super({
      datasources: url ? { db: { url } } : undefined,
      log:
        config.get<string>('NODE_ENV') === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
    this.enabled = Boolean(url);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.enabled) return;
    await this.$disconnect();
  }
}
