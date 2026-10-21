import {
  POLIZA_COLUMNAS,
  POLIZA_LOTE,
  buildPolizasUpsert,
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

describe('coberturas en el sync de pólizas', () => {
  const build = () => {
    const executeQuery = jest.fn().mockResolvedValue({ rows: [] });
    const repo = new SyncUpsertRepository({ executeQuery } as never);
    return { repo, executeQuery };
  };

  it('upsertCobertura usa "<cramo>-<ccobertura>" como código y marca inactivas las no vigentes', async () => {
    const { repo, executeQuery } = build();
    await repo.upsertCobertura(1, {
      id: '7-1',
      cramo: 7,
      ccobertura: '1',
      descripcion: 'EMERGENCIAS MEDICAS',
      activo: false,
    });
    const [query, params] = executeQuery.mock.calls[0];
    expect(query).toContain('INSERT INTO cobertura');
    expect(query).toContain('ON CONFLICT (id_aseguradora, codigo)');
    expect(params).toMatchObject({ aseguradoraId: 1, codigo: '7-1', idRamo: 7, ccobertura: '1', activo: false });
  });

  it('upsertCobertura ignora filas sin código', async () => {
    const { repo, executeQuery } = build();
    await repo.upsertCobertura(1, { id: '  ', descripcion: 'X' });
    expect(executeQuery).not.toHaveBeenCalled();
  });

  const idx = (col: string) => POLIZA_COLUMNAS.findIndex((c) => c.col === col);

  it('upsertPoliza guarda coberturas_codigos como text[] (se actualiza al re-sincronizar)', async () => {
    const { repo, executeQuery } = build();
    await repo.upsertPoliza(1, { origenClave: 'P-1', numeroPoliza: 'P-1', coberturasCodigos: '7-1,7-3' });
    const [query, params] = executeQuery.mock.calls[0];
    const k = idx('coberturas_codigos');
    expect(query).toContain(`string_to_array(NULLIF(@r0c${k}, ''), ',')`);
    expect(query).toContain('coberturas_codigos = EXCLUDED.coberturas_codigos');
    expect(params[`r0c${k}`]).toBe('7-1,7-3');
  });

  it('upsertPoliza sin coberturas deja la columna en null', async () => {
    const { repo, executeQuery } = build();
    await repo.upsertPoliza(1, { origenClave: 'P-2', numeroPoliza: 'P-2' });
    expect(executeQuery.mock.calls[0][1][`r0c${idx('coberturas_codigos')}`]).toBeNull();
  });
});

describe('buildPolizasUpsert', () => {
  const poliza = (n: number, extra: Record<string, unknown> = {}) => ({
    origenClave: `P-${n}`,
    numeroPoliza: `P-${n}`,
    idRamo: 7,
    ...extra,
  });

  it('un solo INSERT multi-fila que actualiza solo lo que cambió (IS DISTINCT FROM)', () => {
    const { query, params } = buildPolizasUpsert(3, [poliza(1), poliza(2)]);
    expect(query).toContain('INSERT INTO poliza');
    expect((query.match(/\(@aseguradoraId,/g) ?? []).length).toBe(2);
    expect(query).toContain('ON CONFLICT (id_aseguradora, origen_clave) WHERE origen_clave IS NOT NULL');
    expect(query).toContain('IS DISTINCT FROM');
    expect(query).toContain('RETURNING 1');
    expect(query).not.toContain('origen_clave = EXCLUDED.origen_clave');
    expect(params.aseguradoraId).toBe(3);
    expect(Object.keys(params)).toHaveLength(1 + 2 * POLIZA_COLUMNAS.length);
  });

  it('respeta los nombres antiguos de campos (fechaInicio, primaAnual, nombreContratante...)', () => {
    const { params } = buildPolizasUpsert(1, [
      { origenId: 'P-9', fechaInicio: '2026-01-01', primaAnual: 120, nombreContratante: 'X', documentoContratante: 'V1' },
    ]);
    const idx = (col: string) => POLIZA_COLUMNAS.findIndex((c) => c.col === col);
    expect(params[`r0c${idx('origen_clave')}`]).toBe('P-9');
    expect(params[`r0c${idx('fecha_desde_poliza')}`]).toBe('2026-01-01');
    expect(params[`r0c${idx('prima_total')}`]).toBe(120);
    expect(params[`r0c${idx('nombre_tomador')}`]).toBe('X');
    expect(params[`r0c${idx('cedula_tomador')}`]).toBe('V1');
  });

  it('upsertPolizasChangedBatch parte en lotes y cuenta solo lo escrito', async () => {
    const executeQuery = jest.fn().mockResolvedValue({ rows: [], rowsAffected: 2 });
    const repo = new SyncUpsertRepository({ executeQuery } as never);
    const filas = Array.from({ length: POLIZA_LOTE + 1 }, (_, i) => poliza(i));
    const escritas = await repo.upsertPolizasChangedBatch(1, filas);
    expect(executeQuery).toHaveBeenCalledTimes(2);
    expect(escritas).toBe(4);
  });

  it('un lote no supera el límite de parámetros de PostgreSQL (65.535)', () => {
    expect(POLIZA_COLUMNAS.length * POLIZA_LOTE).toBeLessThan(65535);
  });
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
