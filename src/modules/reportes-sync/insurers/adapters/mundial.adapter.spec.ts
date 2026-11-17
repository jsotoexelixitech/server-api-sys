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

describe('mundialAdapter · placa y tipo de vehículo en recibos', () => {
  const base = { recibo: '18-1', poliza: 'P', fecha_desde: '2026-03-07', tipo_recibo: 'P' };

  it('mapea placa y tipo_vehiculo del extract', () => {
    const row = mundialAdapter.mapRow('recibos', {
      ...base,
      placa: 'AB123CD',
      tipo_vehiculo: 'MOTOCICLETA',
    }) as Record<string, unknown>;

    expect(row.placa).toBe('AB123CD');
    expect(row.tipoVehiculo).toBe('MOTOCICLETA');
  });

  it('recibos sin vehículo (otros ramos) quedan nulos', () => {
    const row = mundialAdapter.mapRow('recibos', base) as Record<string, unknown>;

    expect(row.placa ?? null).toBeNull();
    expect(row.tipoVehiculo ?? null).toBeNull();
  });
});

describe('mundialAdapter · catálogo de coberturas', () => {
  it('conserva el id "<cramo>-<ccobertura>" como texto y trae ramo y código', () => {
    const row = mundialAdapter.mapRow('coberturas', {
      id: '5-12',
      cramo: 5,
      ccobertura: '12',
      descripcion: 'MUERTE ACCIDENTAL',
      activo: true,
      modified_at: '2026-10-22T10:00:00Z',
    }) as Record<string, unknown>;

    expect(row.id).toBe('5-12');
    expect(row.origenClave).toBe('5-12');
    expect(row.cramo).toBe(5);
    expect(row.ccobertura).toBe('12');
    expect(row.descripcion).toBe('MUERTE ACCIDENTAL');
    expect(row.activo).toBe(true);
  });

  it('una cobertura inactiva (activo=0) queda inactiva', () => {
    const row = mundialAdapter.mapRow('coberturas', { id: '7-1', cramo: 7, ccobertura: '1', descripcion: 'X', activo: 0 }) as Record<string, unknown>;
    expect(row.activo).toBe(false);
  });

  it('los otros catálogos siguen con id numérico', () => {
    const row = mundialAdapter.mapRow('ramos', { id: 18, descripcion: 'AUTOMOVIL', activo: 1 }) as Record<string, unknown>;
    expect(row.id).toBe(18);
    expect(row.origenClave).toBe('18');
  });
});
