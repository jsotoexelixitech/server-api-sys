import { Injectable, Logger } from '@nestjs/common';
import { MssqlService } from '../../../database/mssql.service';

export type BcvRateSource = 'mavamonedas' | 'mavamoneda' | 'mamonedas';

export interface BcvRateRow {
  ptasa: number;
  source: Exclude<BcvRateSource, 'mamonedas'>;
}

@Injectable()
export class BcvRateRepository {
  private readonly logger = new Logger(BcvRateRepository.name);

  constructor(private readonly db: MssqlService) {}

  async findPtasamonUsdForDate(fechaYmd: string): Promise<BcvRateRow | null> {
    for (const table of ['mavamonedas', 'mavamoneda'] as const) {
      try {
        const ptasa = await this.queryPtasamonFromTable(table, fechaYmd);
        if (ptasa != null) {
          return { ptasa, source: table };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/Invalid object name/i.test(msg)) throw err;
        this.logger.warn(`Tabla ${table} no disponible: ${msg}`);
      }
    }
    return null;
  }

  async findPtasamonUsdVigente(): Promise<number | null> {
    const req = this.db.request();
    const result = await req.query(
      `SELECT TOP 1 ptasamon FROM mamonedas WHERE TRIM(cmoneda) = '$'`,
    );
    const ptasamon = Number(result.recordset?.[0]?.ptasamon ?? 0);
    return Number.isFinite(ptasamon) && ptasamon > 0 ? ptasamon : null;
  }

  private async queryPtasamonFromTable(
    tableName: 'mavamonedas' | 'mavamoneda',
    fechaYmd: string,
  ): Promise<number | null> {
    const req = this.db.request();
    req.input('f', this.db.types.Date, fechaYmd);
    const result = await req.query(`
      SELECT TOP 1 ptasamon
      FROM ${tableName}
      WHERE TRIM(cmoneda) = '$'
        AND CONVERT(date, fmoneda) = @f
      ORDER BY fmoneda DESC
    `);
    const ptasamon = Number(result.recordset?.[0]?.ptasamon ?? 0);
    return Number.isFinite(ptasamon) && ptasamon > 0 ? ptasamon : null;
  }
}
