import { Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../../database/reportes-pg.service';

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

  /** Locks tomados por este proceso (cada uno retiene su conexión dedicada). */
  private readonly held = new Map<number, () => Promise<void>>();

  async tryAcquire(aseguradoraId: number, entidad: string): Promise<boolean> {
    const key = this.lockKey(aseguradoraId, entidad);
    if (this.held.has(key)) return false;
    const release = await this.reportesPg.tryAdvisoryLock(key);
    if (!release) return false;
    this.held.set(key, release);
    return true;
  }

  async release(aseguradoraId: number, entidad: string): Promise<void> {
    const key = this.lockKey(aseguradoraId, entidad);
    const release = this.held.get(key);
    if (!release) return;
    this.held.delete(key);
    await release();
  }
}
