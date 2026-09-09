// eslint-disable-next-line @typescript-eslint/no-require-imports
import sql = require('mssql');
import type {
  OriginDbAdapter,
  OriginQueryResult,
} from './origin-adapter.types';

/** Match ET MssqlAdapter: pass type factories to request.input. */
function inferSqlType(name: string, value: unknown) {
  if (value === null || value === undefined) return sql.NVarChar;
  if (typeof value === 'boolean') return sql.Bit;
  if (typeof value === 'number') {
    if (name === 'cusuario') return sql.Numeric(13);
    return Number.isInteger(value) ? sql.Int : sql.Float;
  }
  if (value instanceof Date) return sql.DateTime;
  if (typeof value === 'string' && value.length > 100) return sql.VarChar(sql.MAX);
  return sql.VarChar(255);
}

export class MssqlOriginAdapter implements OriginDbAdapter {
  private pool: sql.ConnectionPool | null = null;

  constructor(private readonly config: sql.config) {}

  async connect(): Promise<void> {
    this.pool = await new sql.ConnectionPool(this.config).connect();
  }

  async executeQuery(
    query: string,
    params: Record<string, unknown> = {},
  ): Promise<OriginQueryResult> {
    try {
      if (!this.pool) {
        return { error: true, message: 'MSSQL origin pool not connected' };
      }
      const request = this.pool.request();
      for (const [name, value] of Object.entries(params)) {
        request.input(name, inferSqlType(name, value), value ?? null);
      }
      const result = await request.query(query);
      const recordset = (result.recordset || []) as Record<string, unknown>[];
      return {
        recordset,
        recordsets: [recordset],
        rowsAffected: Array.isArray(result.rowsAffected)
          ? result.rowsAffected.reduce((a, b) => a + b, 0)
          : Number(result.rowsAffected || 0),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: true, message };
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
