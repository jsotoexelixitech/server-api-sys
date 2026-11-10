import {
  CobroDiasError, ConfigCobroDias, cotizarCobroDias, diasInclusivos, primaDiariaTotal, validarConfigCobroDias,
} from './configurador.cobro-dias';

const config = (over: Partial<ConfigCobroDias> = {}): ConfigCobroDias => ({
  activo: true,
  dias_min: 1,
  dias_max: 30,
  primas: [{ ccober: '1', prima_diaria: 1.25 }, { ccober: '2', prima_diaria: 0.333 }],
  ...over,
});

const codigo = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof CobroDiasError ? e.codigo : 'OTRO';
  }
  return 'SIN_ERROR';
};

describe('cobro por días: días inclusivos', () => {
  it('mismo día = 1', () => expect(diasInclusivos('2026-11-10', '2026-11-10')).toBe(1));
  it('fhasta - fdesde + 1', () => expect(diasInclusivos('2026-11-01', '2026-11-10')).toBe(10));
  it('cruza fin de mes y año bisiesto', () => {
    expect(diasInclusivos('2028-02-28', '2028-03-01')).toBe(3);
    expect(diasInclusivos('2026-12-31', '2027-01-01')).toBe(2);
  });
  it('fhasta anterior o fecha inválida = FECHAS', () => {
    expect(codigo(() => diasInclusivos('2026-11-10', '2026-11-09'))).toBe('FECHAS');
    expect(codigo(() => diasInclusivos('2026-02-30', '2026-03-01'))).toBe('FECHAS');
    expect(codigo(() => diasInclusivos('10/11/2026', '2026-11-12'))).toBe('FECHAS');
  });
});

describe('cobro por días: cotizar', () => {
  it('prima por cobertura redondeada a 2 decimales y total = suma', () => {
    const r = cotizarCobroDias(config(), { fdesde: '2026-11-01', fhasta: '2026-11-07' });
    expect(r.dias).toBe(7);
    expect(r.coberturas).toEqual([
      { ccober: '1', prima_diaria: 1.25, prima: 8.75 },
      { ccober: '2', prima_diaria: 0.333, prima: 2.33 },
    ]);
    expect(r.prima_diaria_total).toBe(1.583);
    expect(r.prima_total).toBe(11.08);
  });

  it('redondeo a la mitad hacia arriba (1.005 × 1 = 1.01)', () => {
    const r = cotizarCobroDias(config({ primas: [{ ccober: '1', prima_diaria: 1.005 }] }), { dias: 1 });
    expect(r.prima_total).toBe(1.01);
  });

  it('acepta dias en lugar de fechas', () => {
    expect(cotizarCobroDias(config(), { dias: 3 }).dias).toBe(3);
    expect(codigo(() => cotizarCobroDias(config(), { dias: 0 }))).toBe('FECHAS');
    expect(codigo(() => cotizarCobroDias(config(), { fdesde: '2026-11-01' }))).toBe('FECHAS');
  });

  it('límites min/max inclusivos', () => {
    const c = config({ dias_min: 3, dias_max: 5 });
    expect(cotizarCobroDias(c, { dias: 3 }).dias).toBe(3);
    expect(cotizarCobroDias(c, { dias: 5 }).dias).toBe(5);
    expect(codigo(() => cotizarCobroDias(c, { dias: 2 }))).toBe('RANGO');
    expect(codigo(() => cotizarCobroDias(c, { fdesde: '2026-11-01', fhasta: '2026-11-06' }))).toBe('RANGO');
  });

  it('plan inexistente o inactivo', () => {
    expect(codigo(() => cotizarCobroDias(null, { dias: 1 }))).toBe('SIN_CONFIG');
    expect(codigo(() => cotizarCobroDias(config({ activo: false }), { dias: 1 }))).toBe('INACTIVO');
    expect(codigo(() => cotizarCobroDias(config({ primas: [] }), { dias: 1 }))).toBe('INACTIVO');
  });
});

describe('cobro por días: validar configuración', () => {
  it('válida', () => expect(validarConfigCobroDias(config())).toEqual([]));
  it('rango y primas', () => {
    expect(validarConfigCobroDias(config({ dias_min: 0 })).length).toBe(1);
    expect(validarConfigCobroDias(config({ dias_max: 367 })).length).toBe(1);
    expect(validarConfigCobroDias(config({ dias_min: 10, dias_max: 5 })).length).toBe(1);
    expect(validarConfigCobroDias(config({ primas: [] })).length).toBe(1);
    expect(validarConfigCobroDias(config({ activo: false, primas: [] }))).toEqual([]);
    expect(validarConfigCobroDias(config({ primas: [{ ccober: '1', prima_diaria: 1 }, { ccober: '1', prima_diaria: 2 }] })).length).toBe(1);
    expect(validarConfigCobroDias(config({ primas: [{ ccober: '1', prima_diaria: 0 }] })).length).toBe(1);
  });
  it('prima diaria total', () => expect(primaDiariaTotal([{ ccober: '1', prima_diaria: 0.1 }, { ccober: '2', prima_diaria: 0.2 }])).toBe(0.3));
});
