import { DEFAULT_PORTS, type InsurerDbType } from '../../origin-db/origin-db-engine.types';

export type SqlDialect = {
  healthQuery: string;
  quoteTable: (schema: string, table: string) => string;
  castId: string;
  param: (name: string) => string;
};

export function getDialect(tipoDb: InsurerDbType | string): SqlDialect {
  const dialects: Record<string, SqlDialect> = {
    mssql: {
      healthQuery: 'SELECT 1 AS ok',
      quoteTable(schema, table) {
        return `[${schema}].[${table}]`;
      },
      castId: 'CAST(id AS NVARCHAR(50)) AS id',
      param(name) {
        return `@${name}`;
      },
    },
    postgresql: {
      healthQuery: 'SELECT 1 AS ok',
      quoteTable(schema, table) {
        return `"${schema}"."${table}"`;
      },
      castId: 'id::text AS id',
      param(name) {
        return `@${name}`;
      },
    },
    oracle: {
      healthQuery: 'SELECT 1 AS ok FROM DUAL',
      quoteTable(schema, table) {
        return `"${String(schema).toUpperCase()}"."${String(table).toUpperCase()}"`;
      },
      castId: 'TO_CHAR(id) AS id',
      param(name) {
        return `:${name}`;
      },
    },
    mysql: {
      healthQuery: 'SELECT 1 AS ok',
      quoteTable(schema, table) {
        return `\`${schema}\`.\`${table}\``;
      },
      castId: 'CAST(id AS CHAR(50)) AS id',
      param(name) {
        return `@${name}`;
      },
    },
  };

  const dialect = dialects[tipoDb];
  if (!dialect) {
    throw new Error(`Dialecto SQL no definido para motor: ${tipoDb}`);
  }
  return dialect;
}

export function defaultSchemaFor(
  tipoDb: string,
  schemaOrigen?: string | null,
): string {
  if (schemaOrigen) return schemaOrigen;
  const defaults: Record<string, string> = {
    mssql: 'dbo',
    postgresql: 'public',
    oracle: '',
    mysql: '',
  };
  return defaults[tipoDb] ?? 'public';
}

export function defaultPortFor(tipoDb: string): number {
  return (DEFAULT_PORTS as Record<string, number>)[tipoDb] ?? 1433;
}
