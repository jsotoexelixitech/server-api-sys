import { mundialAdapter } from './insurers/adapters/mundial.adapter';
import { SyncUpsertRepository } from './repositories/sync-upsert.repository';

const fila = (extra: Record<string, unknown> = {}) => ({
  numero_poliza: '18-1-0000000001',
  fecha_desde_poliza: new Date('2026-01-01T00:00:00Z'),
  fecha_emision_poliza: new Date('2026-01-01T00:00:00Z'),
  id_ramo: 18,
  ...extra,
});

describe('Pólizas · coberturas', () => {
  it('el adaptador toma las coberturas de la fila del origen', () => {
    const m = mundialAdapter.mapRow('polizas', fila({ coberturas: 'COBERTURA AMPLIA / PERDIDA TOTAL' }), {} as never);
    expect(m.coberturas).toBe('COBERTURA AMPLIA / PERDIDA TOTAL');
  });

  it('sin coberturas queda como cadena vacía (no null)', () => {
    expect(mundialAdapter.mapRow('polizas', fila(), {} as never).coberturas).toBe('');
    expect(mundialAdapter.mapRow('polizas', fila({ coberturas: '   ' }), {} as never).coberturas).toBe('');
  });

  it('el upsert de pólizas escribe y actualiza la columna coberturas', async () => {
    const executeQuery = jest.fn(async (_sql: string, _params?: Record<string, unknown>) => ({ rowsAffected: 1 }));
    const repo = new SyncUpsertRepository({ executeQuery } as never);
    await repo.upsertPoliza(1, { origenClave: 'X-1', numeroPoliza: 'X', coberturas: 'A / B' });
    const [sql, params] = executeQuery.mock.calls[0] as [string, Record<string, unknown>];
    expect(sql).toContain('serial_motor, coberturas,');
    expect(sql).toContain('@serialMotor, @coberturas,');
    expect(sql).toContain('coberturas = EXCLUDED.coberturas');
    expect(params.coberturas).toBe('A / B');
  });

  it('el upsert sin coberturas escribe cadena vacía', async () => {
    const executeQuery = jest.fn(async (_sql: string, _params?: Record<string, unknown>) => ({ rowsAffected: 1 }));
    const repo = new SyncUpsertRepository({ executeQuery } as never);
    await repo.upsertPoliza(1, { origenClave: 'X-2', numeroPoliza: 'Y' });
    expect((executeQuery.mock.calls[0] as [string, Record<string, unknown>])[1].coberturas).toBe('');
  });
});
