import { Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../../database/reportes-pg.service';
import { firstRow } from '../utils/sync.helpers';

@Injectable()
export class SyncLockService {
  constructor(private readonly reportesPg: ReportesPgService) {}

  private lockKey(aseguradoraId: number, entidad: string): number {
    const entityCodes: Record<string, number> = {
      polizas: 1,
      recibos: 2,
      siniestros: 3,
    };
    const entityCode = entityCodes[entidad] ?? 0;
    return aseguradoraId * 1000 + entityCode;
  }

  async tryAcquire(aseguradoraId: number, entidad: string): Promise<boolean> {
    const key = this.lockKey(aseguradoraId, entidad);
    const result = await this.reportesPg.executeQuery(
      'SELECT pg_try_advisory_lock(@key) AS locked',
      { key },
    );
    const row = firstRow(result, 'tryAcquire');
    return Boolean(row?.locked);
  }

  async release(aseguradoraId: number, entidad: string): Promise<void> {
    const key = this.lockKey(aseguradoraId, entidad);
    await this.reportesPg.executeQuery('SELECT pg_advisory_unlock(@key)', {
      key,
    });
  }
}
