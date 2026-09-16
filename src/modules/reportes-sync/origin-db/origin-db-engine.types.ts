/** Motores de BD soportados como origen de aseguradoras. */
export const INSURER_DB_TYPES = Object.freeze({
  MSSQL: 'mssql',
  POSTGRESQL: 'postgresql',
  ORACLE: 'oracle',
  MYSQL: 'mysql',
} as const);

export type InsurerDbType =
  (typeof INSURER_DB_TYPES)[keyof typeof INSURER_DB_TYPES];

export const DEFAULT_PORTS: Readonly<Record<InsurerDbType, number>> =
  Object.freeze({
    mssql: 1433,
    postgresql: 5432,
    oracle: 1521,
    mysql: 3306,
  });

export function normalizeInsurerDbType(value: unknown): InsurerDbType {
  const normalized = String(value || '')
    .toLowerCase()
    .trim();
  const aliases: Record<string, InsurerDbType> = {
    sqlserver: INSURER_DB_TYPES.MSSQL,
    'sql server': INSURER_DB_TYPES.MSSQL,
    mssql: INSURER_DB_TYPES.MSSQL,
    postgres: INSURER_DB_TYPES.POSTGRESQL,
    postgresql: INSURER_DB_TYPES.POSTGRESQL,
    pg: INSURER_DB_TYPES.POSTGRESQL,
    oracle: INSURER_DB_TYPES.ORACLE,
    mysql: INSURER_DB_TYPES.MYSQL,
    mariadb: INSURER_DB_TYPES.MYSQL,
  };

  const tipo = aliases[normalized];
  if (!tipo) {
    throw new Error(`Motor de BD de aseguradora no soportado: ${value}`);
  }
  return tipo;
}

export function isSupportedInsurerDbType(value: unknown): boolean {
  try {
    normalizeInsurerDbType(value);
    return true;
  } catch {
    return false;
  }
}
