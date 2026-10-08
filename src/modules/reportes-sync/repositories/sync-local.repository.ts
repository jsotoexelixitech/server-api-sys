import { Injectable } from '@nestjs/common';
import {
  ReportesPgService,
  type PgTransaction,
} from '../../../database/reportes-pg.service';
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

/**
 * Columna local (PG) equivalente a la expresión de fecha del origen usada en el extract.
 * Lista cerrada: el nombre de columna se interpola en el SQL del DELETE.
 */
const LOCAL_DATE_COLUMN_BY_ORIGIN_FIELD: Record<string, Record<string, string>> = {
  recibos: {
    femision: 'fecha_emision',
    fdesde: 'fecha_desde',
    fhasta: 'fecha_hasta',
    fcobro: 'fecha_pago',
    fanulacion: 'fecha_anulacion',
  },
};

/** id_estatus local por letra de estado del origen (N/P/C/A). */
const LOCAL_ESTATUS_BY_LETTER: Record<string, number> = {
  N: 1,
  P: 2,
  C: 3,
  A: 4,
};

export type LocalDeleteScope = {
  /** Expresión de fecha del origen (p. ej. rec.fcobro) con la que se extrajo el rango. */
  originDateExpr?: string | null;
  /** Letra de estado aplicada en el extract (N/P/C/A), si hubo filtro. */
  estadoLetter?: string | null;
  /**
   * El extract aplicó filtros adicionales (ramo, canal, productor...) que el DELETE no
   * puede replicar: borrar el rango completo eliminaría filas que no se reinsertan.
   * Se omite el DELETE por rango; el INSERT ya reemplaza por clave de origen.
   */
  skipRangeDelete?: boolean;
};

/** Traduce la expresión de fecha del origen a columna local; null si no hay equivalente. */
export function resolveLocalDateColumn(
  entidad: string,
  originDateExpr?: string | null,
): string | null {
  const map = LOCAL_DATE_COLUMN_BY_ORIGIN_FIELD[entidad];
  if (!map || !originDateExpr) return null;
  const field = originDateExpr.trim().replace(/^\w+\./, '').toLowerCase();
  return map[field] ?? null;
}

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

  /**
   * Condiciones del alcance de un sync (aseguradora, rango en la columna local equivalente a la fecha del
   * extract y estado). Compartido por el DELETE completo y por el borrado de lo que ya no existe en el origen.
   */
  private buildScopeClauses(
    entidad: string,
    desde?: Date | null,
    hasta?: Date | null,
    scope?: LocalDeleteScope,
  ): { clauses: string[]; params: Record<string, unknown> } {
    // El DELETE debe cubrir exactamente lo que el extract vuelve a insertar: misma
    // columna de fecha y mismo estado. Si no, se pierden filas que el extract no trae.
    const scopedCol = resolveLocalDateColumn(entidad, scope?.originDateExpr);
    const dateCol = scopedCol || LOCAL_DATE_COLUMNS[entidad];
    const params: Record<string, unknown> = {};
    const clauses = ['id_aseguradora = @aseguradoraId'];

    if (dateCol && desde) {
      clauses.push(`${dateCol} >= @desde`);
      params.desde = desde;
    }
    if (dateCol && hasta) {
      // Columnas timestamp: el extract usa < hasta + 1 día (incluye todo el día final).
      clauses.push(
        scopedCol
          ? `${dateCol} < (@hasta::date + 1)`
          : `${dateCol} <= @hasta`,
      );
      params.hasta = hasta;
    }
    if (scopedCol && scope?.estadoLetter) {
      const idEstatus = LOCAL_ESTATUS_BY_LETTER[scope.estadoLetter];
      if (idEstatus !== undefined) {
        clauses.push('id_estatus = @idEstatus');
        params.idEstatus = idEstatus;
      }
    }

    return { clauses, params };
  }

  async deleteLocalRows(
    aseguradoraId: number,
    entidad: string,
    desde?: Date | null,
    hasta?: Date | null,
    scope?: LocalDeleteScope,
    tx?: PgTransaction,
  ): Promise<number> {
    if (CATALOG_TABLES[entidad as CatalogEntidad]) return 0;

    const table = LOCAL_TABLES[entidad];
    if (!table) return 0;
    if (scope?.skipRangeDelete) return 0;

    const { clauses, params } = this.buildScopeClauses(entidad, desde, hasta, scope);
    const query = `DELETE FROM ${table} WHERE ${clauses.join(' AND ')}`;
    const result = await (tx ?? this.reportesPg).executeQuery(query, { ...params, aseguradoraId });
    if ('error' in result && result.error) {
      throw new Error(result.message);
    }
    return result.rowsAffected || 0;
  }

  /**
   * Borra, dentro del alcance del sync, las filas cuya clave de origen ya no vino en el extract
   * (recibos eliminados o que salieron del rango en el origen). Las que sí vinieron no se tocan.
   * Anti-join contra el arreglo de claves (hash), no `<> ALL(array)`, para que escale a cientos de miles.
   */
  async deleteScopeNotIn(
    aseguradoraId: number,
    entidad: string,
    origenClaves: string[],
    desde?: Date | null,
    hasta?: Date | null,
    scope?: LocalDeleteScope,
    tx?: PgTransaction,
  ): Promise<number> {
    if (CATALOG_TABLES[entidad as CatalogEntidad]) return 0;
    const table = LOCAL_TABLES[entidad];
    if (!table) return 0;
    if (scope?.skipRangeDelete) return 0;

    const { clauses, params } = this.buildScopeClauses(entidad, desde, hasta, scope);
    const query = `DELETE FROM ${table} AS t
       WHERE ${clauses.join(' AND ')}
         AND NOT EXISTS (
           SELECT 1 FROM unnest(@origenClaves::text[]) AS k(v) WHERE k.v = t.origen_clave
         )`;
    const result = await (tx ?? this.reportesPg).executeQuery(query, {
      ...params,
      aseguradoraId,
      origenClaves,
    });
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
    tx?: PgTransaction,
  ): Promise<number> {
    if (CATALOG_TABLES[entidad as CatalogEntidad]) return 0;
    const table = LOCAL_TABLES[entidad];
    if (!table || origenClaves.length === 0) return 0;

    const unique = Array.from(
      new Set(origenClaves.map((c) => String(c).trim()).filter(Boolean)),
    );
    if (unique.length === 0) return 0;

    const result = await (tx ?? this.reportesPg).executeQuery(
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
