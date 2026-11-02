import { VIAJERO_TARIFA_DIARIA_USD, viajeroProrrataPrimaExt } from './viajero-emission.rules';

describe('viajeroProrrataPrimaExt (fallback prorrata viajero)', () => {
  it('usa 0,75 USD por día, igual que spCalculoViajeroProrrata', () => {
    expect(VIAJERO_TARIFA_DIARIA_USD).toBe(0.75);
  });

  it.each([
    [3, 2.25],
    [4, 3.0],
    [5, 3.75],
    [6, 4.5],
    [15, 11.25],
  ])('%i días → %d USD', (ndias, esperado) => {
    expect(viajeroProrrataPrimaExt(ndias)).toBe(esperado);
  });

  it('no repite el error de prod: no es tabla(0,15·ndias) × ndias', () => {
    expect(viajeroProrrataPrimaExt(3)).not.toBe(1.35);
    expect(viajeroProrrataPrimaExt(4)).not.toBe(2.4);
  });
});
