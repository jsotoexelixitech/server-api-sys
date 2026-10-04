import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface ArysMembershipConfigValues {
  retryEnabled: boolean;
  retryIntervalSeconds: number;
  maxAttempts: number;
  retryBaseMinutes: number;
  retryMaxMinutes: number;
  batchSize: number;
  /** Reporte de fallos a Exelixi Monitor. */
  monitorEnabled: boolean;
  monitorUrl: string | null;
  monitorAppId: string;
  monitorToken: string | null;
  /** Reportar todo 5xx de la API (requiere monitorEnabled). */
  monitorReport5xx: boolean;
  /** Observar tráfico externo y enviarlo al monitor en modo dry-run (nunca bloquea). */
  monitorSecurityObserve: boolean;
}

/** Config sin el token, apta para devolver por la API. */
export type ArysMembershipConfigPublic = Omit<ArysMembershipConfigValues, 'monitorToken'> & {
  monitorTokenSet: boolean;
};

export const ARYS_CONFIG_DEFAULTS: ArysMembershipConfigValues = {
  retryEnabled: false,
  retryIntervalSeconds: 300,
  maxAttempts: 5,
  retryBaseMinutes: 15,
  retryMaxMinutes: 360,
  batchSize: 10,
  monitorEnabled: false,
  monitorUrl: null,
  monitorAppId: 'sysip-nest-api',
  monitorToken: null,
  monitorReport5xx: true,
  monitorSecurityObserve: false,
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
            monitorEnabled: row.monitorEnabled,
            monitorUrl: row.monitorUrl,
            monitorAppId: row.monitorAppId,
            monitorToken: row.monitorToken,
            monitorReport5xx: row.monitorReport5xx,
            monitorSecurityObserve: row.monitorSecurityObserve,
          };
        }
      } catch {
        // BD sin la tabla aún: se usan los valores por defecto (reintento apagado)
      }
    }
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Igual que get(), pero sin exponer el token. */
  async getPublic(): Promise<ArysMembershipConfigPublic> {
    const { monitorToken, ...rest } = await this.get();
    return { ...rest, monitorTokenSet: Boolean(monitorToken) };
  }

  async update(
    patch: Partial<ArysMembershipConfigValues>,
    updatedBy?: string,
  ): Promise<ArysMembershipConfigPublic> {
    const data: Partial<ArysMembershipConfigValues> = {};
    if (patch.retryEnabled !== undefined) data.retryEnabled = Boolean(patch.retryEnabled);
    if (patch.monitorEnabled !== undefined) data.monitorEnabled = Boolean(patch.monitorEnabled);
    if (patch.monitorReport5xx !== undefined) data.monitorReport5xx = Boolean(patch.monitorReport5xx);
    if (patch.monitorSecurityObserve !== undefined) {
      data.monitorSecurityObserve = Boolean(patch.monitorSecurityObserve);
    }
    if (patch.monitorUrl !== undefined) {
      const url = patch.monitorUrl?.trim() || null;
      if (url && !/^https?:\/\//i.test(url)) {
        throw new Error('monitorUrl debe empezar con http:// o https://');
      }
      data.monitorUrl = url;
    }
    if (patch.monitorAppId !== undefined) {
      const id = patch.monitorAppId.trim();
      if (!id) throw new Error('monitorAppId no puede estar vacío');
      data.monitorAppId = id;
    }
    if (patch.monitorToken !== undefined) data.monitorToken = patch.monitorToken?.trim() || null;
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
    return this.getPublic();
  }
}
