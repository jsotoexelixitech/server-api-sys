import { mundialAdapter } from './mundial.adapter';

describe('mundialAdapter · canal y tipo de canal', () => {
  it('recibos: mapea id_canal y tipo_canal del extract', () => {
    const row = mundialAdapter.mapRow('recibos', {
      recibo: '18-100129643',
      poliza: '1800000002480',
      fecha_desde: '2026-03-07',
      tipo_recibo: 'P',
      id_canal: 0,
      tipo_canal: 'Tradicional',
    }) as Record<string, unknown>;

    expect(row.idCanal).toBe(0);
    expect(row.tipoCanal).toBe('Tradicional');
  });

  it('recibos: sin tipo_canal queda nulo (no rompe extracts antiguos)', () => {
    const row = mundialAdapter.mapRow('recibos', {
      recibo: '18-1',
      poliza: 'X',
      fecha_desde: '2026-03-07',
      tipo_recibo: 'P',
      id_canal: 24,
    }) as Record<string, unknown>;

    expect(row.idCanal).toBe(24);
    expect(row.tipoCanal ?? null).toBeNull();
  });

  it('siniestros: mapea id_canal y tipo_canal', () => {
    const row = mundialAdapter.mapRow('siniestros', {
      numero_siniestro: '5-000000733',
      numero_poliza: '5-1',
      id_canal: 8,
      tipo_canal: 'Alterno',
    }) as Record<string, unknown>;

    expect(row.idCanal).toBe(8);
    expect(row.tipoCanal).toBe('Alterno');
  });

  it('siniestros: sin canal en el extract queda nulo', () => {
    const row = mundialAdapter.mapRow('siniestros', {
      numero_siniestro: '5-000000733',
      numero_poliza: '5-1',
    }) as Record<string, unknown>;

    expect(row.idCanal ?? null).toBeNull();
    expect(row.tipoCanal ?? null).toBeNull();
  });
});
