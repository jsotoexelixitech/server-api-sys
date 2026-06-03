import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sql = require('mssql');

@Injectable()
export class MssqlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MssqlService.name);
  private pool: sql.ConnectionPool | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const cfg: sql.config = {
      user: this.config.getOrThrow<string>('USER_BD'),
      password: this.config.getOrThrow<string>('PASSWORD_BD'),
      server: this.config.getOrThrow<string>('SERVER_BD'),
      database: this.config.getOrThrow<string>('NAME_BD'),
      requestTimeout: this.config.get<number>('MSSQL_REQUEST_TIMEOUT', 300000),
      options: {
        encrypt: this.config.get<boolean>('MSSQL_ENCRYPT', false),
        trustServerCertificate: this.config.get<boolean>(
          'MSSQL_TRUST_SERVER_CERTIFICATE',
          true,
        ),
        enableArithAbort: this.config.get<boolean>(
          'MSSQL_ENABLE_ARITH_ABORT',
          true,
        ),
      },
      pool: {
        max: 20,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    this.pool = new sql.ConnectionPool(cfg);
    this.pool.on('error', (err: Error) =>
      this.logger.error('mssql pool error', err.stack ?? String(err)),
    );

    try {
      await this.pool.connect();
      this.logger.log(
        `mssql pool connected -> ${cfg.server}/${cfg.database} as ${cfg.user}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `No se pudo conectar a la base de datos (${cfg.server}). ¿Está activa la VPN? — ${msg}`,
      );
      this.pool = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  /**
   * Returns a fresh request bound to the shared pool.
   * Each request must be created per call (mssql does NOT allow reusing requests).
   */
  request(): sql.Request {
    if (!this.pool || !this.pool.connected) {
      throw new Error('mssql pool is not connected');
    }
    return this.pool.request();
  }

  transaction(): sql.Transaction {
    if (!this.pool || !this.pool.connected) {
      throw new Error('mssql pool is not connected');
    }
    return new sql.Transaction(this.pool);
  }

  /** Re-exported so services can reference sql.Int, sql.NVarChar, etc. without their own import. */
  get types(): typeof sql {
    return sql;
  }
}
