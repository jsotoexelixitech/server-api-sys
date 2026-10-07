import {
  SINIESTRO_COLUMNAS,
  SINIESTRO_LOTE,
  SyncUpsertRepository,
  buildSiniestrosUpsert,
} from './sync-upsert.repository';

const fila = (n: number, extra: Record<string, unknown> = {}) => ({
  origenClave: `S-${n}`,
  numeroSiniestro: `S-${n}`,
  numeroPoliza: `P-${n}`,
  idRamo: 18,
  idEstatus: 2,
  ...extra,
});

describe('buildSiniestrosUpsert', () => {
  it('arma un INSERT multi-fila con una columna por cada campo y ON CONFLICT por origen_clave', () => {
    const { query, params } = buildSiniestrosUpsert(7, [fila(1), fila(2)]);
    expect(query).toContain('INSERT INTO siniestro');
    expect(query).toContain('ON CONFLICT (id_aseguradora, origen_clave) WHERE origen_clave IS NOT NULL');
    expect(query).toContain('DO UPDATE SET');
    expect(query).toContain('synced_at = NOW()');
    // 2 filas → 2 grupos de valores
    expect((query.match(/\(@aseguradoraId,/g) ?? []).length).toBe(2);
    expect(params.aseguradoraId).toBe(7);
    expect(Object.keys(params)).toHaveLength(1 + 2 * SINIESTRO_COLUMNAS.length);
  });

  it('incluye las columnas de canal y vehículo, y no actualiza origen_clave', () => {
    const { query } = buildSiniestrosUpsert(1, [fila(1)]);
    for (const c of ['id_canal', 'tipo_canal', 'cobertura_afectada', 'placa', 'marca_vehiculo']) {
      expect(query).toContain(c);
    }
    expect(query).not.toContain('origen_clave = EXCLUDED.origen_clave');
  });

  it('valores ausentes van como null, salvo cobertura_afectada que es cadena vacía (como antes)', () => {
    const { params } = buildSiniestrosUpsert(1, [fila(1)]);
    const idx = (col: string) => SINIESTRO_COLUMNAS.findIndex((c) => c.col === col);
    expect(params[`r0c${idx('cobertura_afectada')}`]).toBe('');
    expect(params[`r0c${idx('id_canal')}`]).toBeNull();
    expect(params[`r0c${idx('placa')}`]).toBeNull();
    expect(params[`r0c${idx('id_ramo')}`]).toBe(18);
  });

  it('un lote no supera el límite de parámetros de PostgreSQL (65.535)', () => {
    expect(SINIESTRO_COLUMNAS.length * SINIESTRO_LOTE).toBeLessThan(65535);
  });
});

describe('SyncUpsertRepository.upsertSiniestrosBatch', () => {
  function build() {
    const executeQuery = jest.fn(async () => ({ recordset: [], recordsets: [[]], rowsAffected: 0 }));
    return { repo: new SyncUpsertRepository({ executeQuery } as never), executeQuery };
  }

  it('si un origen_clave llega repetido gana la última fila (evita "ON CONFLICT ... second time")', async () => {
    const { repo, executeQuery } = build();
    await repo.upsertSiniestrosBatch(1, [
      fila(1, { montoPagadoBs: 10 }),
      fila(2),
      fila(1, { montoPagadoBs: 99 }),
    ]);
    expect(executeQuery).toHaveBeenCalledTimes(1);
    const params = (executeQuery.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    const idx = SINIESTRO_COLUMNAS.findIndex((c) => c.col === 'monto_pagado_bs');
    const valores = Object.entries(params)
      .filter(([k]) => k.endsWith(`c${idx}`))
      .map(([, v]) => v);
    expect(valores).toHaveLength(2); // 2 siniestros distintos
    expect(valores).toContain(99);
    expect(valores).not.toContain(10);
  });

  it('parte en lotes y usa la transacción recibida', async () => {
    const { repo, executeQuery } = build();
    const tx = { executeQuery: jest.fn(async () => ({ recordset: [], recordsets: [[]], rowsAffected: 0 })) };
    const filas = Array.from({ length: SINIESTRO_LOTE * 2 + 10 }, (_, i) => fila(i));
    await repo.upsertSiniestrosBatch(1, filas, tx as never);
    expect(tx.executeQuery).toHaveBeenCalledTimes(3);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('upsertSiniestro (una fila) sigue funcionando', async () => {
    const { repo, executeQuery } = build();
    await repo.upsertSiniestro(1, fila(1));
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });
});
