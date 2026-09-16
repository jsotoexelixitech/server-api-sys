import { Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../../database/reportes-pg.service';
import { firstRow, assertQueryResult } from '../utils/sync.helpers';

@Injectable()
export class SyncWatermarkRepository {
  constructor(private readonly reportesPg: ReportesPgService) {}

  async getWatermark(
    aseguradoraId: number,
    entidad: string,
  ): Promise<Record<string, unknown> | null> {
    const result = await this.reportesPg.executeQuery(
      `SELECT id, last_modified_at, last_run_at, rows_synced, last_error
     FROM sync_watermark
     WHERE id_aseguradora = @aseguradoraId AND entidad = @entidad::sync_entidad
     LIMIT 1`,
      { aseguradoraId, entidad },
    );
    return firstRow(result, 'getWatermark');
  }

  async upsertWatermark(
    aseguradoraId: number,
    entidad: string,
    data: {
      lastModifiedAt?: Date | null;
      lastRunAt?: Date | null;
      rowsSynced?: number;
      lastError?: string | null;
    },
  ): Promise<Record<string, unknown> | null> {
    const result = await this.reportesPg.executeQuery(
      `INSERT INTO sync_watermark (
       id_aseguradora, entidad, last_modified_at, last_run_at, rows_synced, last_error
     ) VALUES (
       @aseguradoraId, @entidad::sync_entidad, @lastModifiedAt, @lastRunAt, @rowsSynced, @lastError
     )
     ON CONFLICT (id_aseguradora, entidad)
     DO UPDATE SET
       last_modified_at = COALESCE(EXCLUDED.last_modified_at, sync_watermark.last_modified_at),
       last_run_at = EXCLUDED.last_run_at,
       rows_synced = EXCLUDED.rows_synced,
       last_error = EXCLUDED.last_error
     RETURNING id, last_modified_at, last_run_at, rows_synced, last_error`,
      {
        aseguradoraId,
        entidad,
        lastModifiedAt: data.lastModifiedAt ?? null,
        lastRunAt: data.lastRunAt ?? null,
        rowsSynced: data.rowsSynced ?? 0,
        lastError: data.lastError ?? null,
      },
    );
    return firstRow(result, 'upsertWatermark');
  }

  async listByAseguradora(
    aseguradoraId: number,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.reportesPg.executeQuery(
      `SELECT entidad, last_modified_at, last_run_at, rows_synced, last_error
     FROM sync_watermark
     WHERE id_aseguradora = @aseguradoraId
     ORDER BY entidad ASC`,
      { aseguradoraId },
    );
    return assertQueryResult(result, 'listByAseguradora');
  }
}
