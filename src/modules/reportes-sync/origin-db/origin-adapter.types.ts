export type OriginQuerySuccess = {
  recordset: Record<string, unknown>[];
  recordsets: Record<string, unknown>[][];
  rowsAffected: number;
  error?: undefined;
};

export type OriginQueryError = {
  error: true;
  message: string;
};

export type OriginQueryResult = OriginQuerySuccess | OriginQueryError;

export interface OriginDbAdapter {
  connect(): Promise<void>;
  executeQuery(
    query: string,
    params?: Record<string, unknown>,
  ): Promise<OriginQueryResult>;
  disconnect(): Promise<void>;
}

export type OriginConnectionConfig = {
  id: number;
  tipoDb: string;
  host: string;
  port?: number | null;
  databaseName?: string | null;
  username?: string | null;
  password?: string | null;
  schemaOrigen?: string | null;
  [key: string]: unknown;
};
