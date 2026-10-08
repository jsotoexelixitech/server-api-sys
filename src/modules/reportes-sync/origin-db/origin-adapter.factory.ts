import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sql = require('mssql');
import {
  DEFAULT_PORTS,
  normalizeInsurerDbType,
} from './origin-db-engine.types';
import type {
  OriginConnectionConfig,
  OriginDbAdapter,
} from './origin-adapter.types';
import { MssqlOriginAdapter } from './mssql-origin.adapter';
import { PostgresOriginAdapter } from './postgres-origin.adapter';
import { MysqlOriginAdapter } from './mysql-origin.adapter';
import { OracleOriginAdapter } from './oracle-origin.adapter';

/** Variables de entorno sin validar llegan como texto: "false" no debe leerse como verdadero. */
function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'si', 'sí'].includes(v)) return true;
    if (['false', '0', 'no'].includes(v)) return false;
  }
  return fallback;
}

@Injectable()
export class OriginAdapterFactory {
  constructor(private readonly config: ConfigService) {}

  create(connectionConfig: OriginConnectionConfig): OriginDbAdapter {
    const tipoDb = normalizeInsurerDbType(connectionConfig.tipoDb);
    const timeout = Number(
      this.config.get<number>('REPORTES_SYNC_TIMEOUT_MS', 30000),
    );
    const encrypt = toBool(this.config.get('DB_ENCRYPT'), false);
    const trustCert = toBool(this.config.get('DB_TRUST_SERVER_CERTIFICATE'), true);
    // Paquetes TDS más grandes = menos viajes al entregar miles de filas (el valor por defecto es 4096).
    const packetSizeEnv = Math.floor(Number(this.config.get('REPORTES_SYNC_ORIGIN_PACKET_SIZE', 16384)));
    const packetSize = Number.isFinite(packetSizeEnv) ? Math.min(32767, Math.max(512, packetSizeEnv)) : 16384;

    switch (tipoDb) {
      case 'mssql': {
        const mssqlConfig: sql.config = {
          server: connectionConfig.host,
          port: Number(connectionConfig.port ?? DEFAULT_PORTS.mssql),
          user: connectionConfig.username || undefined,
          password: connectionConfig.password || undefined,
          database: connectionConfig.databaseName || undefined,
          connectionTimeout: timeout,
          requestTimeout: timeout,
          pool: { max: 5, min: 0, idleTimeoutMillis: 60000 },
          // packetSize lo acepta el driver (tedious) aunque el tipo de mssql no lo declare.
          options: {
            encrypt,
            trustServerCertificate: trustCert,
            enableArithAbort: true,
            packetSize,
          } as sql.config['options'],
        };
        return new MssqlOriginAdapter(mssqlConfig);
      }

      case 'postgresql':
        return new PostgresOriginAdapter({
          host: connectionConfig.host,
          port: Number(connectionConfig.port ?? DEFAULT_PORTS.postgresql),
          user: connectionConfig.username || '',
          password: connectionConfig.password || '',
          database: connectionConfig.databaseName || '',
          max: 5,
          min: 0,
          idleTimeoutMillis: 60000,
          connectionTimeoutMillis: timeout,
          ssl: encrypt ? { rejectUnauthorized: !trustCert } : undefined,
          schema: connectionConfig.schemaOrigen || 'public',
        });

      case 'oracle':
        return new OracleOriginAdapter();

      case 'mysql':
        return new MysqlOriginAdapter();

      default:
        throw new Error(`Motor no soportado: ${tipoDb}`);
    }
  }
}
