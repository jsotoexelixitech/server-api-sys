import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OriginAdapterFactory } from '../origin-db/origin-adapter.factory';
import type { OriginDbAdapter } from '../origin-db/origin-adapter.types';
import { getDialect } from './dialects';
import { normalizeInsurerDbType } from '../origin-db/origin-db-engine.types';
import { assertReadOnlyQuery } from './insurer-readonly.guard';
import type { InsurerConnectionConfig } from './adapters/insurer-adapter.types';

const POOL_TTL_MS = 5 * 60 * 1000;

type PoolEntry = {
  adapter: OriginDbAdapter;
  configHash: string;
  lastUsedAt: number;
};

@Injectable()
export class InsurerPoolManager implements OnModuleDestroy {
  private readonly logger = new Logger(InsurerPoolManager.name);
  private readonly pools = new Map<number, PoolEntry>();

  constructor(private readonly originAdapterFactory: OriginAdapterFactory) {}

  private configHash(config: InsurerConnectionConfig): string {
    return [
      config.tipoDb,
      config.host,
      config.port,
      config.databaseName,
      config.username,
      config.schemaOrigen,
    ].join('|');
  }

  async getDbAdapter(
    connectionConfig: InsurerConnectionConfig,
  ): Promise<OriginDbAdapter> {
    const key = connectionConfig.id;
    const hash = this.configHash(connectionConfig);
    const existing = this.pools.get(key);

    if (
      existing &&
      existing.configHash === hash &&
      Date.now() - existing.lastUsedAt < POOL_TTL_MS
    ) {
      existing.lastUsedAt = Date.now();
      return existing.adapter;
    }

    if (existing?.adapter?.disconnect) {
      await existing.adapter.disconnect();
    }

    const adapter = this.originAdapterFactory.create(connectionConfig);
    await adapter.connect();

    this.pools.set(key, {
      adapter,
      configHash: hash,
      lastUsedAt: Date.now(),
    });

    return adapter;
  }

  async query(
    connectionConfig: InsurerConnectionConfig,
    queryText: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>[]> {
    assertReadOnlyQuery(queryText);
    const adapter = await this.getDbAdapter(connectionConfig);
    const result = await adapter.executeQuery(queryText, params);
    if ('error' in result && result.error) {
      throw new Error(result.message);
    }
    return result.recordset || [];
  }

  async healthCheck(
    connectionConfig: InsurerConnectionConfig,
  ): Promise<Record<string, unknown>> {
    const started = Date.now();
    try {
      const engine = normalizeInsurerDbType(connectionConfig.tipoDb);
      const dialect = getDialect(engine);
      await this.query(connectionConfig, dialect.healthQuery, {});
      return { ok: true, latencyMs: Date.now() - started, motor: engine };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        motor: connectionConfig.tipoDb,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(
      [...this.pools.values()].map(async (entry) => {
        if (entry.adapter?.disconnect) {
          await entry.adapter.disconnect();
        }
      }),
    );
    this.pools.clear();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.disconnectAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`disconnectAll on destroy: ${message}`);
    }
  }
}
