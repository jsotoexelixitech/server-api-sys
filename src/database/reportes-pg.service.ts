import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, types } from 'pg';

const INT8_OID = 20;
const NUMERIC_OID = 1700;

function parseNumeric(value: string | null): number | string | null {
  if (value === null) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) || Number.isFinite(parsed) ? parsed : value;
}

types.setTypeParser(INT8_OID, parseNumeric);
types.setTypeParser(NUMERIC_OID, parseNumeric);

export interface ReportesQuerySuccess {
  recordset: Record<string, unknown>[];
  recordsets: Record<string, unknown>[][];
  rowsAffected: number;
  error?: undefined;
}

export interface ReportesQueryError {
  error: true;
  message: string;
}

export type ReportesQueryResult = ReportesQuerySuccess | ReportesQueryError;

type PgRoutineRow = {
  schema_name: string;
  routine_name: string;
  prokind: string;
  argnames: string[] | string;
  argmodes: string[] | string;
  argtypes: string[];
};

function isValidIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function quoteIdentifier(value: string): string {
  if (!isValidIdentifier(value)) {
    throw new Error(`Invalid PostgreSQL identifier: ${value}`);
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeParams(
  params: Record<string, unknown> = {},
): [string, unknown][] {
  return Object.entries(params).map(([name, value]) => [name, value ?? null]);
}

function parsePgArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  const items: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaping = false;

  for (const char of inner) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      items.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  items.push(current);
  return items.map((item) => (item === 'NULL' ? null : item)) as string[];
}

function canonicalParamName(name: string): string {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/^p_/, '')
    .replace(/^x/, '')
    .replace(/^c/, '')
    .replace(/^id_/, '')
    .replace(/_json$/, '')
    .replace(/_/g, '');
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

function normalizeResult(result: QueryResult): ReportesQuerySuccess {
  const recordset = Array.isArray(result.rows)
    ? result.rows.map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
        const keys = Object.keys(row);
        if (keys.length !== 1) return row as Record<string, unknown>;
        const value = (row as Record<string, unknown>)[keys[0]];
        if (
          value &&
          typeof value === 'object' &&
          !Buffer.isBuffer(value) &&
          !(value instanceof Date)
        ) {
          return value as Record<string, unknown>;
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

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback errors to preserve the original failure.
  }
}

function isTransientPgError(error: unknown): boolean {
  const err = error as { message?: string; code?: string };
  const message = String(err?.message || error || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  return (
    message.includes('connection terminated') ||
    message.includes('connection error') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('client was closed') ||
    message.includes('cannot use a pool after calling end') ||
    [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      '57P01',
      '57P03',
      '08006',
      '08003',
    ].includes(code)
  );
}

@Injectable()
export class ReportesPgService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportesPgService.name);
  private pool: Pool | null = null;
  private schemas: string[] = ['public'];
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.enabled = this.config.get<boolean>('REPORTES_ENABLED', false);
    if (!this.enabled) {
      this.logger.warn(
        'REPORTES_ENABLED=false — pool PostgreSQL reportes no se conectará',
      );
      return;
    }
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new Error(
        'Reportes PostgreSQL está deshabilitado (REPORTES_ENABLED=false)',
      );
    }
  }

  async connect(): Promise<void> {
    this.assertEnabled();
    if (this.pool) {
      try {
        await this.pool.end();
      } catch {
        // Ignore shutdown errors while reconnecting.
      }
    }

    const schema =
      this.config.get<string>('REPORTES_PG_SCHEMA', 'public') || 'public';
    this.schemas = Array.from(new Set([schema, 'public'].filter(Boolean)));

    this.pool = new Pool({
      host: this.config.getOrThrow<string>('REPORTES_PG_HOST'),
      port: this.config.get<number>('REPORTES_PG_PORT', 5432),
      user: this.config.getOrThrow<string>('REPORTES_PG_USER'),
      password: this.config.getOrThrow<string>('REPORTES_PG_PASSWORD'),
      database: this.config.get<string>('REPORTES_PG_DATABASE', 'reportes'),
      ssl: this.config.get<boolean>('REPORTES_PG_ENCRYPT', false)
        ? {
            rejectUnauthorized: !this.config.get<boolean>(
              'REPORTES_PG_TRUST_SERVER_CERTIFICATE',
              true,
            ),
          }
        : undefined,
    });

    this.pool.on('error', (error: Error) => {
      this.logger.error(`idle client error: ${error.message}`);
    });

    await this.pool.query('SELECT 1');
    this.logger.log(
      `reportes pg connected -> ${this.config.get('REPORTES_PG_HOST')}/${this.config.get('REPORTES_PG_DATABASE', 'reportes')}`,
    );
  }

  async reconnect(): Promise<void> {
    await this.connect();
  }

  private async acquireClient(): Promise<PoolClient> {
    if (!this.pool) await this.connect();
    const client = await this.pool!.connect();
    const bound = client as PoolClient & { __pgErrorHandlerBound?: boolean };
    if (!bound.__pgErrorHandlerBound) {
      bound.__pgErrorHandlerBound = true;
      client.on('error', (error: Error) => {
        this.logger.error(`client connection error: ${error.message}`);
      });
    }
    return client;
  }

  private releaseClient(client: PoolClient | null, hadError = false): void {
    if (!client) return;
    try {
      client.release(hadError);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`client release error: ${msg}`);
    }
  }

  private async runWithRetry<T>(
    operation: () => Promise<T>,
    maxAttempts = 2,
  ): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (!this.pool) {
          await this.connect();
        }
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isTransientPgError(error) || attempt >= maxAttempts) {
          break;
        }
        await this.reconnect();
      }
    }

    throw lastError;
  }

  async executeQuery(
    query: string,
    params: Record<string, unknown> = {},
  ): Promise<ReportesQueryResult> {
    try {
      this.assertEnabled();
      return await this.runWithRetry(async () => {
        const statement = buildNamedQuery(query, params);
        const result = await this.pool!.query(statement);
        return normalizeResult(result);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`executeQuery failed: ${message}`);
      return { error: true, message };
    }
  }

  private async resolveRoutine(
    client: PoolClient,
    routineName: string,
    params: Record<string, unknown> = {},
  ): Promise<PgRoutineRow | null> {
    const inputCount = Object.keys(params).length;
    const result = await client.query(
      `SELECT
         n.nspname AS schema_name,
         p.proname AS routine_name,
         p.prokind,
         COALESCE(p.proargnames, ARRAY[]::text[]) AS argnames,
         COALESCE(p.proargmodes, ARRAY[]::"char"[]) AS argmodes,
         ARRAY(
           SELECT format_type(arg_oid, NULL)
           FROM unnest(COALESCE(p.proallargtypes, p.proargtypes::oid[])) AS arg_oid
         ) AS argtypes
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = ANY($1::text[])
         AND p.proname = $2`,
      [this.schemas, routineName],
    );

    const candidates = (result.rows as PgRoutineRow[]).filter((row) => {
      const modes = parsePgArray(row.argmodes);
      const normalizedModes = modes.length
        ? modes
        : (row.argtypes || []).map(() => 'i');
      const count = normalizedModes.filter((mode) =>
        ['i', 'b', 'v'].includes(mode),
      ).length;
      return count === inputCount;
    });

    return (
      candidates.find((row) => row.prokind === 'p') ||
      candidates[0] ||
      (result.rows as PgRoutineRow[]).find((row) => row.prokind === 'p') ||
      (result.rows as PgRoutineRow[])[0] ||
      null
    );
  }

  private buildParamLookup(
    params: Record<string, unknown> = {},
  ): Map<string, unknown> {
    const entries = normalizeParams(params);
    const lookup = new Map<string, unknown>();

    entries.forEach(([name, value]) => {
      lookup.set(name, value);
      lookup.set(String(name).toLowerCase(), value);
      lookup.set(canonicalParamName(name), value);
    });

    return lookup;
  }

  private resolveParamValue(
    argName: string,
    lookup: Map<string, unknown>,
    sequentialValues: unknown[],
    fallbackIndexRef: { current: number },
  ): unknown {
    const candidates = [
      argName,
      typeof argName === 'string' ? argName.toLowerCase() : argName,
      canonicalParamName(argName),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (lookup.has(candidate)) return lookup.get(candidate);
    }

    const nextValue = sequentialValues[fallbackIndexRef.current];
    fallbackIndexRef.current += 1;
    return nextValue;
  }

  private buildRoutineArgs(
    routine: PgRoutineRow,
    params: Record<string, unknown> = {},
    includeOutParams = false,
  ): { sqlArgs: string[]; values: unknown[] } {
    const entries = normalizeParams(params);
    const valuesByName = this.buildParamLookup(params);
    const sequentialValues = entries.map(([, value]) => value);
    const argnames = parsePgArray(routine?.argnames);
    const parsedModes = parsePgArray(routine?.argmodes);
    const argmodes = parsedModes.length
      ? parsedModes
      : (routine?.argtypes || []).map(() => 'i');

    const sqlArgs: string[] = [];
    const values: unknown[] = [];
    const fallbackIndexRef = { current: 0 };

    argmodes.forEach((mode, index) => {
      const argName = argnames[index];
      const isOutput = ['o', 't'].includes(mode);

      if (isOutput && includeOutParams) {
        sqlArgs.push('NULL');
        return;
      }

      if (isOutput && !includeOutParams) return;

      const value = this.resolveParamValue(
        argName,
        valuesByName,
        sequentialValues,
        fallbackIndexRef,
      );
      sqlArgs.push(`$${values.length + 1}`);
      values.push(value ?? null);
    });

    return { sqlArgs, values };
  }

  private async executeFunction(
    client: PoolClient,
    routine: PgRoutineRow,
    params: Record<string, unknown>,
  ): Promise<ReportesQuerySuccess> {
    const { sqlArgs, values } = this.buildRoutineArgs(routine, params, false);
    const schemaName = routine?.schema_name || this.schemas[0] || 'public';
    const routineName = routine?.routine_name;

    if (
      !routineName ||
      !isValidIdentifier(schemaName) ||
      !isValidIdentifier(routineName)
    ) {
      throw new Error(
        `Unable to resolve PostgreSQL function "${routineName || 'unknown'}"`,
      );
    }

    const sql = `SELECT * FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(routineName)}(${sqlArgs.join(', ')})`;
    const result = await client.query(sql, values);
    return normalizeResult(result);
  }

  private async executeProcedure(
    client: PoolClient,
    routine: PgRoutineRow,
    params: Record<string, unknown>,
  ): Promise<ReportesQuerySuccess> {
    const { sqlArgs, values } = this.buildRoutineArgs(routine, params, true);
    const schemaName = routine?.schema_name || this.schemas[0] || 'public';
    const routineName = routine?.routine_name;

    if (
      !routineName ||
      !isValidIdentifier(schemaName) ||
      !isValidIdentifier(routineName)
    ) {
      throw new Error(
        `Unable to resolve PostgreSQL procedure "${routineName || 'unknown'}"`,
      );
    }

    const sql = `CALL ${quoteIdentifier(schemaName)}.${quoteIdentifier(routineName)}(${sqlArgs.join(', ')})`;
    const result = await client.query(sql, values);
    const row = result.rows?.[0] || null;
    const cursorNames = row
      ? Object.values(row).filter(
          (value) => typeof value === 'string' && value.trim() !== '',
        )
      : [];

    if (!cursorNames.length) {
      return normalizeResult(result);
    }

    const recordsets: Record<string, unknown>[][] = [];
    for (const cursorName of cursorNames) {
      const fetch = await client.query(
        `FETCH ALL FROM ${quoteIdentifier(String(cursorName))}`,
      );
      recordsets.push((fetch.rows || []) as Record<string, unknown>[]);
    }

    return {
      recordset: recordsets[0] || [],
      recordsets,
      rowsAffected: recordsets.reduce((total, rows) => total + rows.length, 0),
    };
  }

  async executeSP(
    spName: string,
    params: Record<string, unknown> = {},
  ): Promise<ReportesQueryResult> {
    try {
      this.assertEnabled();
      return await this.runWithRetry(async () => {
        let client: PoolClient | null = null;
        let hadError = false;
        try {
          client = await this.acquireClient();
          const routine = await this.resolveRoutine(client, spName, params);
          if (!routine) {
            throw new Error(`PostgreSQL routine "${spName}" not found`);
          }

          await client.query('BEGIN');
          const result =
            routine.prokind === 'p'
              ? await this.executeProcedure(client, routine, params)
              : await this.executeFunction(client, routine, params);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          hadError = true;
          if (client) {
            await safeRollback(client);
          }
          throw error;
        } finally {
          this.releaseClient(client, hadError);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`executeSP(${spName}) failed: ${message}`);
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
