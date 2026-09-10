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

@Injectable()
export class OriginAdapterFactory {
  constructor(private readonly config: ConfigService) {}

  create(connectionConfig: OriginConnectionConfig): OriginDbAdapter {
    const tipoDb = normalizeInsurerDbType(connectionConfig.tipoDb);
    const timeout = Number(
      this.config.get<number>('REPORTES_SYNC_TIMEOUT_MS', 30000),
    );
    const encrypt = this.config.get<boolean>('DB_ENCRYPT', false);
    const trustCert = this.config.get<boolean>(
      'DB_TRUST_SERVER_CERTIFICATE',
      true,
    );

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
          options: {
            encrypt,
            trustServerCertificate: trustCert,
            enableArithAbort: true,
          },
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
