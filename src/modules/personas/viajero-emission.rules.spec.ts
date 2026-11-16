import {
  assertViajeLocalEmission,
  assertViajeroCotizacion,
  isViajeLocalPlan,
  isViajeroProrrataPlan,
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
