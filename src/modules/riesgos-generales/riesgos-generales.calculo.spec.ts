import {
  calcularCoberturas, mapCoberturaRamo, mapRamoPatrimonial, resolverSumas, sumaPorCalculo, sumarMeses, type CoberturaTarifa,
} from './riesgos-generales.calculo';

const cob = (ccober: string, pprima: number, extra: Partial<CoberturaTarifa> = {}): CoberturaTarifa => ({
  ccober, ctarifa: '1', xcobertura: `COB ${ccober}`, msumaplan: 10000, pprima, msumamin: 0, msumamax: 0,
  obligatoria: false, pcomision: 10, ...extra,
});

describe('calcularCoberturas', () => {
  const tarifa = [cob('1', 0.5), cob('4', 0.3), cob('5', 0.4, { msumamin: 1000, msumamax: 50000 })];

  it('prima = suma × tasa / 100 y suma asegurada = la de la básica', () => {
    const { cotizacion, errores } = calcularCoberturas(tarifa, [{ ccober: '1', suma: 140000 }, { ccober: '5', suma: 24000 }]);
    expect(errores).toEqual([]);
    expect(cotizacion!.coberturas.map((c) => c.prima)).toEqual([700, 96]);
    expect([cotizacion!.suma_asegurada, cotizacion!.prima_total, cotizacion!.comision_total]).toEqual([140000, 796, 79.6]);
  });

  it('exige la básica y las marcadas como obligatorias', () => {
    const t = [...tarifa, cob('16', 0.5, { obligatoria: true })];
    const { errores } = calcularCoberturas(t, [{ ccober: '4', suma: 1000 }]);
    expect(errores).toEqual(['COB 1 es obligatoria.', 'COB 16 es obligatoria.']);
  });

  it('rechaza coberturas ajenas, repetidas, fuera de tope o sin tasa', () => {
    const t = [...tarifa, cob('22', 0)];
    const { cotizacion, errores } = calcularCoberturas(t, [
      { ccober: '1', suma: 1000 }, { ccober: '1', suma: 1000 }, { ccober: '99', suma: 1 },
      { ccober: '5', suma: 60000 }, { ccober: '22', suma: 500 },
    ]);
    expect(cotizacion).toBeNull();
    expect(errores).toEqual([
      'La cobertura 1 está repetida.', 'La cobertura 99 no pertenece al plan.',
      'COB 5: la suma máxima es 50000.', 'COB 22: no tiene tasa vigente en matarifa_d.',
    ]);
  });

  it('sin calculo, cada cobertura debe traer suma (400 legible por cobertura)', () => {
    const { cotizacion, errores } = calcularCoberturas(tarifa, [{ ccober: '1' }, { ccober: '4', suma: 1000 }, { ccober: '5' }]);
    expect(cotizacion).toBeNull();
    expect(errores).toEqual([
      'La cobertura 1 no tiene suma: envíe suma o calculo.', 'La cobertura 5 no tiene suma: envíe suma o calculo.',
    ]);
  });

  it('con calculo: suma = unidades × valor_unidad en todas las coberturas e ignora la suma enviada', () => {
    const t = [cob('1', 1.666667), cob('2', 1.666667), cob('3', 1.666667)];
    const { cotizacion, errores } = calcularCoberturas(
      t, [{ ccober: '1', suma: 999 }, { ccober: '2' }, { ccober: '3' }], { unidades: 20000, valor_unidad: 2.5 },
    );
    expect(errores).toEqual([]);
    expect(cotizacion!.coberturas.map((c) => c.suma_asegurada)).toEqual([50000, 50000, 50000]);
    expect(cotizacion!.coberturas.map((c) => c.prima)).toEqual([833.33, 833.33, 833.33]);
    expect([cotizacion!.suma_asegurada, cotizacion!.prima_total]).toEqual([50000, 2499.99]);
  });

  it('con calculo aplica los topes de la tarifa sobre la suma calculada', () => {
    const { errores } = calcularCoberturas(tarifa, [{ ccober: '1' }, { ccober: '5' }], { unidades: 30000, valor_unidad: 2 });
    expect(errores).toEqual(['COB 5: la suma máxima es 50000.']);
  });
});

describe('resolverSumas y sumaPorCalculo', () => {
  it('redondea a 2 decimales', () => {
    expect(sumaPorCalculo({ unidades: 1234.5678, valor_unidad: 0.33 })).toBe(407.41);
    expect(resolverSumas([{ ccober: '1' }], { unidades: 20000, valor_unidad: 2.5 })).toEqual({
      pedidas: [{ ccober: '1', suma: 50000 }], errores: [],
    });
  });
});

describe('sumarMeses', () => {
  const ymd = (d: Date) => d.toISOString().split('T')[0];

  it('31-ago + 6 meses = 28-feb (29 en bisiesto), sin desborde de setMonth', () => {
    expect(ymd(sumarMeses(new Date('2026-08-31T00:00:00Z'), 6))).toBe('2027-02-28');
    expect(ymd(sumarMeses(new Date('2023-08-31T00:00:00Z'), 6))).toBe('2024-02-29');
  });

  it('cruza de año y conserva el día cuando existe', () => {
    expect(ymd(sumarMeses(new Date('2026-11-04T00:00:00Z'), 3))).toBe('2027-02-04');
    expect(ymd(sumarMeses(new Date('2026-11-04T00:00:00Z'), 12))).toBe('2027-11-04');
    expect(ymd(sumarMeses(new Date('2026-01-31T00:00:00Z'), 1))).toBe('2026-02-28');
  });
});

describe('mapCoberturaRamo', () => {
  const fila = { ccober: '5   ', ctarifa: '1 ', xcobertura: 'ROBO ', cmoneda: '$   ', bobligatoria: '0', pprima: 0.4 };

  it('recorta textos y pasa a número con 0 por defecto', () => {
    expect(mapCoberturaRamo({ ...fila, mprima: null, msumamin: 1000, msumamax: 50000 })).toEqual({
      ccober: '5', ctarifa: '1', xcobertura: 'ROBO', cmoneda: '$', obligatoria: false,
      pprima: 0.4, mprima: 0, msumamin: 1000, msumamax: 50000, pcomision: 0,
    });
  });

  it('obligatoria con bobligatoria T o si es la básica', () => {
    expect(mapCoberturaRamo({ ...fila, bobligatoria: 't' }).obligatoria).toBe(true);
    expect(mapCoberturaRamo({ ...fila, ccober: '1   ', bobligatoria: null }).obligatoria).toBe(true);
    expect(mapCoberturaRamo({ ...fila, bobligatoria: null }).obligatoria).toBe(false);
  });
});

describe('mapRamoPatrimonial', () => {
  it('recorta el nombre y pasa a número', () => {
    expect(mapRamoPatrimonial({ cramo: 38, xramo: 'COMBINADO RESIDENCIAL   ', ctiporamo: 6, qcoberturas: 12 })).toEqual({
      cramo: 38, xramo: 'COMBINADO RESIDENCIAL', ctiporamo: 6, qcoberturas: 12,
    });
  });

  it('sin nombre ni conteo: texto vacío y 0 coberturas', () => {
    expect(mapRamoPatrimonial({ cramo: 25, xramo: null, ctiporamo: 1, qcoberturas: null })).toEqual({
      cramo: 25, xramo: '', ctiporamo: 1, qcoberturas: 0,
    });
  });
});
