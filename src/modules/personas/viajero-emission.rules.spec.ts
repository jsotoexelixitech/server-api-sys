import {
  VIAJERO_TARIFA_DIARIA_USD,
  viajeroDiasCobro,
  viajeroProrrataPrimaExt,
} from './viajero-emission.rules';

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

  it.each([
    ['VIAJ10', 9, 15],
    ['VIAJ10', 12, 15],
    ['VIAJ10', 15, 15],
    ['VIAJE9', 8, 8],
    ['VIAJE4', 3, 3],
  ])('%s con %i días de viaje cobra %i días', (cplan, ndias, cobro) => {
    expect(viajeroDiasCobro(5, cplan, ndias)).toBe(cobro);
  });

  it('VIAJ10 cuesta lo mismo con 9 que con 15 días (11,25 USD)', () => {
    expect(viajeroProrrataPrimaExt(viajeroDiasCobro(5, 'VIAJ10', 9))).toBe(11.25);
    expect(viajeroProrrataPrimaExt(viajeroDiasCobro(5, 'VIAJ10', 15))).toBe(11.25);
  });

  it('solo aplica al ramo 5', () => {
    expect(viajeroDiasCobro(25, 'VIAJ10', 10)).toBe(10);
  });

  it('no repite el error de prod: no es tabla(0,15·ndias) × ndias', () => {
    expect(viajeroProrrataPrimaExt(3)).not.toBe(1.35);
    expect(viajeroProrrataPrimaExt(4)).not.toBe(2.4);
  });
});
