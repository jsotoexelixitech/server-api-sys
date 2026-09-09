import { Pool, QueryResult, types } from 'pg';
import type {
  OriginDbAdapter,
  OriginQueryResult,
} from './origin-adapter.types';

const INT8_OID = 20;
const NUMERIC_OID = 1700;

function parseNumeric(value: string | null): number | string | null {
  if (value === null) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) || Number.isFinite(parsed)
    ? parsed
    : value;
}

types.setTypeParser(INT8_OID, parseNumeric);
types.setTypeParser(NUMERIC_OID, parseNumeric);

function normalizeParams(
  params: Record<string, unknown> = {},
): [string, unknown][] {
  return Object.entries(params).map(([name, value]) => [name, value ?? null]);
}

function buildNamedQuery(
  query: string,
  params: Record<string, unknown> = {},
): { text: string; values: unknown[] } {
  const entries = normalizeParams(params);
  const indexByName = new Map<string, number>();
  const values: unknown[] = [];
  let nextIndex = 1;

  const text = query.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    if (!indexByName.has(name)) {
      const entry = entries.find(([entryName]) => entryName === name);
      if (!entry) {
        throw new Error(`Missing value for SQL parameter "${name}"`);
      }
      indexByName.set(name, nextIndex++);
      values.push(entry[1]);
    }
    return `$${indexByName.get(name)}`;
  });

  return { text, values };
}

function normalizeResult(result: QueryResult): OriginQueryResult {
  const recordset = Array.isArray(result.rows)
    ? result.rows.map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          return row as unknown as Record<string, unknown>;
        }
        return row as Record<string, unknown>;
      })
    : [];
  return {
    recordset,
    recordsets: [recordset],
    rowsAffected: result.rowCount ?? 0,
  };
}

export type PostgresOriginConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | { rejectUnauthorized: boolean };
  schema?: string;
};

export class PostgresOriginAdapter implements OriginDbAdapter {
  private pool: Pool | null = null;

  constructor(private readonly config: PostgresOriginConfig) {}

  async connect(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch {
        // Ignore while reconnecting.
      }
    }
    this.pool = new Pool(this.config);
    await this.pool.query('SELECT 1');
  }

  async executeQuery(
    query: string,
    params: Record<string, unknown> = {},
  ): Promise<OriginQueryResult> {
    try {
      if (!this.pool) {
        return { error: true, message: 'PostgreSQL origin pool not connected' };
      }
      const statement = buildNamedQuery(query, params);
      const result = await this.pool.query(statement);
      return normalizeResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: true, message };
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
