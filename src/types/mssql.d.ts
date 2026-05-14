/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'mssql' {
  export interface config {
    user?: string;
    password?: string;
    server: string;
    database?: string;
    port?: number;
    requestTimeout?: number;
    connectionTimeout?: number;
    options?: {
      encrypt?: boolean;
      trustServerCertificate?: boolean;
      enableArithAbort?: boolean;
      stream?: boolean;
    };
    pool?: {
      max?: number;
      min?: number;
      idleTimeoutMillis?: number;
    };
  }

  export interface IResult<T> {
    recordset: T[];
    recordsets: T[][];
    rowsAffected: number[];
    output: Record<string, any>;
  }

  export class ConnectionPool {
    connected: boolean;
    constructor(config: config);
    connect(): Promise<ConnectionPool>;
    close(): Promise<void>;
    request(): Request;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  export class Request {
    input(name: string, type: any, value: any): this;
    output(name: string, type: any, value?: any): this;
    query<T = Record<string, any>>(sql: string): Promise<IResult<T>>;
    execute<T = Record<string, any>>(procedure: string): Promise<IResult<T>>;
  }

  // ── Data types ──────────────────────────────────────────────
  export const Int: any;
  export const BigInt: any;
  export const SmallInt: any;
  export const TinyInt: any;
  export const Bit: any;
  export const Float: any;
  export const Real: any;
  export const DateTime: any;
  export const DateTime2: any;
  export const Date: any;
  export const VarChar: (length?: number) => any;
  export const NVarChar: (length?: number) => any;
  export const Text: any;
  export const NText: any;
  export const Char: (length?: number) => any;
  export const NChar: (length?: number) => any;
  export const Numeric: (precision?: number, scale?: number) => any;
  export const Decimal: (precision?: number, scale?: number) => any;
  export const Money: any;
  export const UniqueIdentifier: any;
  export const Xml: any;
  export const Image: any;
  export const Binary: any;
  export const VarBinary: (length?: number) => any;
}
