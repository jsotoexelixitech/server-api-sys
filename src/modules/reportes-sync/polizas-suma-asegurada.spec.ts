import { mundialAdapter } from './insurers/adapters/mundial.adapter';
import { POLIZA_COLUMNAS, SyncUpsertRepository } from './repositories/sync-upsert.repository';

const param = (col: string) => `r0c${POLIZA_COLUMNAS.findIndex((c) => c.col === col)}`;

const fila = (extra: Record<string, unknown> = {}) => ({
  numero_poliza: '18-1-0000000001',
  fecha_desde_poliza: new Date('2026-01-01T00:00:00Z'),
  fecha_emision_poliza: new Date('2026-01-01T00:00:00Z'),
  id_ramo: 18,
  ...extra,
});

describe('Pólizas · suma asegurada de casco', () => {
  it('el adaptador toma suma_asegurada del origen', () => {
    const m = mundialAdapter.mapRow('polizas', fila({ suma_asegurada: 2485 }), {} as never);
    expect(m.sumaAsegurada).toBe(2485);
  });

  it('sin casco queda en null (no 0)', () => {
    expect(mundialAdapter.mapRow('polizas', fila(), {} as never).sumaAsegurada).toBeNull();
    expect(mundialAdapter.mapRow('polizas', fila({ suma_asegurada: null }), {} as never).sumaAsegurada).toBeNull();
  });

  it('el upsert escribe la columna y la compara para detectar cambios', async () => {
    const executeQuery = jest.fn(async (_sql: string, _params?: Record<string, unknown>) => ({ rowsAffected: 1 }));
    const repo = new SyncUpsertRepository({ executeQuery } as never);
    await repo.upsertPolizasChangedBatch(1, [{ origenClave: 'X-1', numeroPoliza: 'X', sumaAsegurada: 1295 }]);
    const [sql, params] = executeQuery.mock.calls[0] as [string, Record<string, unknown>];
    expect(sql).toContain('suma_asegurada = EXCLUDED.suma_asegurada');
    expect(sql).toContain('poliza.suma_asegurada');
    expect(params[param('suma_asegurada')]).toBe(1295);
  });
});
