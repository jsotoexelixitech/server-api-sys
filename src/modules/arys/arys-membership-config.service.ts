import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface ArysMembershipConfigValues {
  retryEnabled: boolean;
  retryIntervalSeconds: number;
  maxAttempts: number;
  retryBaseMinutes: number;
  retryMaxMinutes: number;
  batchSize: number;
}

export const ARYS_CONFIG_DEFAULTS: ArysMembershipConfigValues = {
  retryEnabled: false,
  retryIntervalSeconds: 300,
  maxAttempts: 5,
  retryBaseMinutes: 15,
  retryMaxMinutes: 360,
  batchSize: 10,
};

const CACHE_MS = 30_000;

const NUMERIC_KEYS = [
  'retryIntervalSeconds',
  'maxAttempts',
  'retryBaseMinutes',
  'retryMaxMinutes',
  'batchSize',
] as const;

/** Config del reintento de membresías Arys, guardada en BD (fila única) y cacheada ~30 s. */
@Injectable()
export class ArysMembershipConfigService {
  private cache: { at: number; value: ArysMembershipConfigValues } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<ArysMembershipConfigValues> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    let value = ARYS_CONFIG_DEFAULTS;
    if (this.prisma.isEnabled()) {
      try {
        const row = await this.prisma.arysMembershipConfig.findUnique({ where: { id: 1 } });
        if (row) {
          value = {
            retryEnabled: row.retryEnabled,
            retryIntervalSeconds: row.retryIntervalSeconds,
            maxAttempts: row.maxAttempts,
            retryBaseMinutes: row.retryBaseMinutes,
            retryMaxMinutes: row.retryMaxMinutes,
            batchSize: row.batchSize,
          };
        }
      } catch {
        // BD sin la tabla aún: se usan los valores por defecto (reintento apagado)
      }
    }
    this.cache = { at: Date.now(), value };
    return value;
  }

  async update(
    patch: Partial<ArysMembershipConfigValues>,
    updatedBy?: string,
  ): Promise<ArysMembershipConfigValues> {
    const data: Partial<ArysMembershipConfigValues> = {};
    if (patch.retryEnabled !== undefined) data.retryEnabled = Boolean(patch.retryEnabled);
    for (const key of NUMERIC_KEYS) {
      const n = patch[key];
      if (n === undefined) continue;
      if (!Number.isInteger(n) || n < 1) throw new Error(`${key} debe ser un entero >= 1`);
      data[key] = n;
    }
    await this.prisma.arysMembershipConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...data, updatedBy },
      update: { ...data, updatedBy },
    });
    this.cache = null;
    return this.get();
  }
}
