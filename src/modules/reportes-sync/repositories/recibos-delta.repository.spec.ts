import {
  RECIBOS_ON_CONFLICT_SOLO_CAMBIOS,
  RECIBO_COLUMNAS_COMPARABLES,
  SyncUpsertRepository,
} from './sync-upsert.repository';
import { SyncLocalRepository } from './sync-local.repository';
import { debeFrenarHuerfanas } from '../utils/sync-guard';

function pgMock(rowsAffected = 0) {
  const executeQuery = jest.fn(async (_sql: string, _params?: Record<string, unknown>) => ({ rowsAffected }));
  return { pg: { executeQuery } as never, executeQuery };
}

const recibo = (n: number) => ({
  origenClave: `R-${n}`,
  poliza: `P-${n}`,
  recibo: `RC-${n}`,
  idEstatus: 3,
  montoRecibo: 100 + n,
  tipoCanal: 'Directo',
  placa: 'AB123CD',
  tipoVehiculo: 'PARTICULARES',
});

describe('SyncUpsertRepository · recibos por diferencias', () => {
  it('upsertRecibosChangedBatch inserta y actualiza solo lo que cambió (ON CONFLICT ... IS DISTINCT FROM)', async () => {
    const { pg, executeQuery } = pgMock(2);
    const repo = new SyncUpsertRepository(pg);
    const cambiadas = await repo.upsertRecibosChangedBatch(1, [recibo(1), recibo(2), recibo(3)]);

    const sql = executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO recibo');
    expect(sql).toContain('ON CONFLICT (id_aseguradora, origen_clave) WHERE origen_clave IS NOT NULL');
    expect(sql).toContain('DO UPDATE SET');
    expect(sql).toContain('IS DISTINCT FROM');
    expect(sql).toContain('synced_at = NOW()');
    expect(cambiadas).toBe(2);
  });

  it('compara todas las columnas de negocio, incluidas las nuevas, y no la clave ni synced_at', () => {
    for (const c of ['tipo_canal', 'placa', 'tipo_vehiculo', 'id_estatus', 'monto_recibo', 'fecha_pago']) {
      expect(RECIBO_COLUMNAS_COMPARABLES).toContain(c);
    }
    expect(RECIBO_COLUMNAS_COMPARABLES).not.toContain('origen_clave');
    expect(RECIBO_COLUMNAS_COMPARABLES).not.toContain('synced_at');
    // la tupla antigua y la nueva tienen las mismas columnas, en el mismo orden
    const tupla = (prefijo: string) =>
      RECIBO_COLUMNAS_COMPARABLES.map((c) => `${prefijo}.${c}`).join(', ');
    expect(RECIBOS_ON_CONFLICT_SOLO_CAMBIOS).toContain(`(${tupla('recibo')})`);
    expect(RECIBOS_ON_CONFLICT_SOLO_CAMBIOS).toContain(`(${tupla('EXCLUDED')})`);
  });

  it('el INSERT clásico (modo anterior) sigue sin ON CONFLICT', async () => {
    const { pg, executeQuery } = pgMock();
    const repo = new SyncUpsertRepository(pg);
    await repo.insertRecibosBatch(1, [recibo(1)]);
    const sql = executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO recibo');
    expect(sql).not.toContain('ON CONFLICT');
  });

  it('sin filas no consulta la base', async () => {
    const { pg, executeQuery } = pgMock();
    const repo = new SyncUpsertRepository(pg);
    expect(await repo.upsertRecibosChangedBatch(1, [])).toBe(0);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('un error de la base se propaga', async () => {
    const executeQuery = jest.fn(async () => ({ error: true, message: 'boom' }));
    const repo = new SyncUpsertRepository({ executeQuery } as never);
    await expect(repo.upsertRecibosChangedBatch(1, [recibo(1)])).rejects.toThrow('boom');
  });
});

describe('SyncLocalRepository · deleteScopeNotIn', () => {
  const desde = new Date('2026-01-01T00:00:00Z');
  const hasta = new Date('2026-09-15T00:00:00Z');

  it('borra del alcance (aseguradora, rango, estado) lo que no vino en las claves, con anti-join', async () => {
    const { pg, executeQuery } = pgMock(7);
    const repo = new SyncLocalRepository(pg);
    const borradas = await repo.deleteScopeNotIn(
      1,
      'recibos',
      ['R-1', 'R-2'],
      desde,
      hasta,
      { originDateExpr: 'rec.fcobro', estadoLetter: 'C' },
    );

    const [sql, params] = executeQuery.mock.calls[0] as [string, Record<string, unknown>];
    expect(sql).toContain('DELETE FROM recibo AS t');
    expect(sql).toContain('id_aseguradora = @aseguradoraId');
    expect(sql).toContain('fecha_pago >= @desde');
    expect(sql).toContain('fecha_pago < (@hasta::date + 1)');
    expect(sql).toContain('id_estatus = @idEstatus');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('unnest(@origenClaves::text[])');
    expect(sql).not.toContain('<> ALL');
    expect(params).toMatchObject({ aseguradoraId: 1, origenClaves: ['R-1', 'R-2'], idEstatus: 3, desde, hasta });
    expect(borradas).toBe(7);
  });

  it('con skipRangeDelete (filtros extra del origen) no borra nada', async () => {
    const { pg, executeQuery } = pgMock();
    const repo = new SyncLocalRepository(pg);
    const n = await repo.deleteScopeNotIn(1, 'recibos', ['R-1'], desde, hasta, { skipRangeDelete: true });
    expect(n).toBe(0);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('no se aplica a catálogos', async () => {
    const { pg, executeQuery } = pgMock();
    const repo = new SyncLocalRepository(pg);
    expect(await repo.deleteScopeNotIn(1, 'ramos', ['1'])).toBe(0);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('deleteLocalRows conserva su comportamiento: mismo alcance, parámetros incluyen la aseguradora', async () => {
    const { pg, executeQuery } = pgMock(3);
    const repo = new SyncLocalRepository(pg);
    const n = await repo.deleteLocalRows(1, 'recibos', desde, hasta, { originDateExpr: 'rec.fdesde' });
    const [sql, params] = executeQuery.mock.calls[0] as [string, Record<string, unknown>];
    expect(sql).toBe(
      'DELETE FROM recibo WHERE id_aseguradora = @aseguradoraId AND fecha_desde >= @desde AND fecha_desde < (@hasta::date + 1)',
    );
    expect(params).toMatchObject({ aseguradoraId: 1, desde, hasta });
    expect(n).toBe(3);
  });
});

describe('debeFrenarHuerfanas', () => {
  it('frena si se borrarían muchas filas y son más que las recibidas', () => {
    expect(debeFrenarHuerfanas({ huerfanas: 500, recibidas: 10 })).toBe(true);
    expect(debeFrenarHuerfanas({ huerfanas: 40000, recibidas: 39999 })).toBe(true);
  });

  it('no frena variaciones normales', () => {
    expect(debeFrenarHuerfanas({ huerfanas: 50, recibidas: 10 })).toBe(false); // alcance chico
    expect(debeFrenarHuerfanas({ huerfanas: 100, recibidas: 0 })).toBe(false);
    expect(debeFrenarHuerfanas({ huerfanas: 300, recibidas: 76000 })).toBe(false);
  });
});
