import { Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../../database/reportes-pg.service';
import { firstRow } from '../utils/sync.helpers';
import {
  CATALOG_TABLES,
  type CatalogEntidad,
} from '../utils/sync-catalog.constants';

const LOCAL_TABLES: Record<string, string> = {
  recibos: 'recibo',
  siniestros: 'siniestro',
  polizas: 'poliza',
  ...CATALOG_TABLES,
};

const LOCAL_DATE_COLUMNS: Record<string, string> = {
  recibos: 'fecha_emision',
  siniestros: 'fecha_notificacion',
  polizas: 'fecha_emision_poliza',
};

@Injectable()
export class SyncLocalRepository {
  constructor(private readonly reportesPg: ReportesPgService) {}

  async countLocalRows(aseguradoraId: number, entidad: string): Promise<number> {
    const table = LOCAL_TABLES[entidad];
    if (!table) return 0;

    const result = await this.reportesPg.executeQuery(
      `SELECT COUNT(*)::int AS total FROM ${table} WHERE id_aseguradora = @aseguradoraId`,
      { aseguradoraId },
    );

    const row = firstRow(result, 'countLocalRows');
    return Number(row?.total ?? 0);
  }

  async deleteLocalRows(
    aseguradoraId: number,
    entidad: string,
    desde?: Date | null,
    hasta?: Date | null,
  ): Promise<number> {
    if (CATALOG_TABLES[entidad as CatalogEntidad]) return 0;

    const table = LOCAL_TABLES[entidad];
    if (!table) return 0;

    const dateCol = LOCAL_DATE_COLUMNS[entidad];
    const params: Record<string, unknown> = { aseguradoraId };
    const clauses = ['id_aseguradora = @aseguradoraId'];

    if (dateCol && desde) {
      clauses.push(`${dateCol} >= @desde`);
      params.desde = desde;
    }
    if (dateCol && hasta) {
      clauses.push(`${dateCol} <= @hasta`);
      params.hasta = hasta;
    }

    const query = `DELETE FROM ${table} WHERE ${clauses.join(' AND ')}`;
    const result = await this.reportesPg.executeQuery(query, params);
    if ('error' in result && result.error) {
      throw new Error(result.message);
    }
    return result.rowsAffected || 0;
  }

  /**
   * Borra en destino por claves de origen (evita conflicto UNIQUE al INSERT
   * cuando el filtro de fecha del extract ≠ fecha_emision del DELETE por rango).
   */
  async deleteByOrigenClaves(
    aseguradoraId: number,
    entidad: string,
    origenClaves: string[],
  ): Promise<number> {
    if (CATALOG_TABLES[entidad as CatalogEntidad]) return 0;
    const table = LOCAL_TABLES[entidad];
    if (!table || origenClaves.length === 0) return 0;

    const unique = Array.from(
      new Set(origenClaves.map((c) => String(c).trim()).filter(Boolean)),
    );
    if (unique.length === 0) return 0;

    const result = await this.reportesPg.executeQuery(
      `DELETE FROM ${table}
       WHERE id_aseguradora = @aseguradoraId
         AND origen_clave = ANY(@origenClaves::text[])`,
      { aseguradoraId, origenClaves: unique },
    );
    if ('error' in result && result.error) {
      throw new Error(result.message);
    }
    return result.rowsAffected || 0;
  }
}
