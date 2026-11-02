import { calcularMontoCobrar } from './monto-cobrar';

describe('calcularMontoCobrar (catálogo autopago)', () => {
  it('sin precio del plan devuelve null', () => {
    expect(calcularMontoCobrar({ mmonto: null, cmoneda: '$', ptasamonUsd: 230 })).toBeNull();
    expect(calcularMontoCobrar({ mmonto: 0, cmoneda: '$', ptasamonUsd: 230 })).toBeNull();
    expect(calcularMontoCobrar({ mmonto: Number.NaN, ptasamonUsd: 230 })).toBeNull();
  });

  it('plan en $: el monto USD es el precio del plan y Bs = precio × tasa del dólar', () => {
    const r = calcularMontoCobrar({ mmonto: 15, cmoneda: '$', ptasamon: 230.1, ptasamonUsd: 230.1 });
    expect(r).toEqual({
      cmoneda_plan: '$',
      ptasamon: 230.1,
      ptasamon_usd: 230.1,
      mprimaext: 15,
      mprima_bs: 3451.5,
      musd: 15,
    });
  });

  it('plan en EUR/TCR (FARMPA): Bs con la tasa del plan y USD = Bs / tasa del dólar', () => {
    const r = calcularMontoCobrar({ mmonto: 33, cmoneda: 'EUR', ptasamon: 251.3, ptasamonUsd: 230.1 });
    expect(r?.mprimaext).toBe(33);
    expect(r?.mprima_bs).toBe(8292.9); // 33 × 251.3
    expect(r?.musd).toBe(36.04); // 8292.9 / 230.1
    expect(r?.cmoneda_plan).toBe('EUR');
  });

  it('plan en Bs: Bs = precio y USD = precio / tasa del dólar', () => {
    const r = calcularMontoCobrar({ mmonto: 4602, cmoneda: 'Bs', ptasamonUsd: 230.1 });
    expect(r?.mprima_bs).toBe(4602);
    expect(r?.musd).toBe(20);
  });

  it('sin tasa del plan en mamonedas usa la del dólar; sin tasas no inventa Bs', () => {
    const conUsd = calcularMontoCobrar({ mmonto: 33.56, cmoneda: 'EUR', ptasamon: null, ptasamonUsd: 230.1 });
    expect(conUsd?.ptasamon).toBe(230.1);
    expect(conUsd?.mprima_bs).toBe(7722.16);
    const sinTasas = calcularMontoCobrar({ mmonto: 33.56, cmoneda: '$' });
    expect(sinTasas).toEqual({
      cmoneda_plan: '$',
      ptasamon: null,
      ptasamon_usd: null,
      mprimaext: 33.56,
      mprima_bs: null,
      musd: 33.56,
    });
  });
});
