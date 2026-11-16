import {
  assertViajeLocalAnualDias,
  assertViajeLocalEmission,
  assertViajeroCotizacion,
  diasViajeInclusivos,
  isViajeLocalAnualProrrataPlan,
  isViajeLocalPlan,
  isViajeroProrrataPlan,
  prorrataAnualPorDias,
} from './viajero-emission.rules';

describe('Viajero Local por días (ramo 25)', () => {
  it('VIAJE, VIAJE5 y VIAJE6 son prorrata con las condiciones de VIAJE (R-095117)', () => {
    for (const plan of ['VIAJE', 'VIAJE5', 'viaje6 ']) {
      expect(isViajeLocalPlan(25, plan)).toBe(true);
      expect(isViajeroProrrataPlan(25, plan)).toBe(true);
    }
  });

  it('VIAJE3/VIAJE4 del ramo 25 (APIs de días fijos) y otros ramos no cambian', () => {
    expect(isViajeLocalPlan(25, 'VIAJE3')).toBe(false);
    expect(isViajeLocalPlan(25, 'VIAJE4')).toBe(false);
    expect(isViajeLocalPlan(5, 'VIAJE5')).toBe(false);
    expect(isViajeroProrrataPlan(5, 'VIAJE5')).toBe(true);
  });

  it('VIAJE5 cotiza con un solo titular y emite sin beneficiarios', () => {
    expect(() => assertViajeroCotizacion(25, 'VIAJE5', 2)).toThrow();
    expect(() =>
      assertViajeLocalEmission(
        { cramo: 25, plan: 'VIAJE6', rif_titular: 'V-1', rif_tomador: 'V-1', fdesde: '2026-11-20', fhasta: '2026-11-25', frecuencia: 'E' },
        [{ xrif_asegurado: '1' }],
        [{}],
      ),
    ).toThrow(/beneficiarios/);
  });
});

describe('VIAJE5/VIAJE6 ramo 25: prorrata de la prima anual por días (R-095117)', () => {
  it('solo VIAJE5/VIAJE6 del ramo 25; VIAJE y el ramo 5 no cambian', () => {
    expect(isViajeLocalAnualProrrataPlan(25, 'VIAJE5')).toBe(true);
    expect(isViajeLocalAnualProrrataPlan(25, ' viaje6')).toBe(true);
    expect(isViajeLocalAnualProrrataPlan(25, 'VIAJE')).toBe(false);
    expect(isViajeLocalAnualProrrataPlan(25, 'VIAJE3')).toBe(false);
    expect(isViajeLocalAnualProrrataPlan(5, 'VIAJE5')).toBe(false);
    expect(isViajeLocalAnualProrrataPlan(5, 'VIAJE6')).toBe(false);
  });

  it('prima = anual × días / 365 redondeada a 2 decimales', () => {
    expect(prorrataAnualPorDias(36.5, 1)).toBe(0.1);
    expect(prorrataAnualPorDias(100, 5)).toBe(1.37);
    expect(prorrataAnualPorDias(100, 8)).toBe(2.19);
    expect(prorrataAnualPorDias(73, 10)).toBe(2);
  });

  it('días inclusivos y tope de 10', () => {
    expect(diasViajeInclusivos('2026-11-20', '2026-11-20')).toBe(1);
    expect(diasViajeInclusivos('2026-11-20', '2026-11-29')).toBe(10);
    expect(() => assertViajeLocalAnualDias(10)).not.toThrow();
    expect(() => assertViajeLocalAnualDias(11)).toThrow('Viajero Local por días: máximo 10 días.');
    expect(() => assertViajeLocalAnualDias(0)).toThrow(/mínimo 1 día/);
    expect(() => diasViajeInclusivos('2026-11-20', '2026-11-19')).toThrow(/anterior/);
  });

  it('la emisión de VIAJE5/VIAJE6 rechaza más de 10 días; VIAJE no tiene ese tope', () => {
    const base = {
      cramo: 25, rif_titular: '1', rif_tomador: '1', fdesde: '2026-11-20', frecuencia: 'E',
    };
    const aseg = [{ xrif_asegurado: '1' }];
    expect(() =>
      assertViajeLocalEmission({ ...base, plan: 'VIAJE5', fhasta: '2026-11-30' }, aseg, []),
    ).toThrow('Viajero Local por días: máximo 10 días.');
    expect(() =>
      assertViajeLocalEmission({ ...base, plan: 'VIAJE6', fhasta: '2026-11-29' }, aseg, []),
    ).not.toThrow();
    expect(() =>
      assertViajeLocalEmission({ ...base, plan: 'VIAJE', fhasta: '2026-11-30' }, aseg, []),
    ).not.toThrow();
  });
});
