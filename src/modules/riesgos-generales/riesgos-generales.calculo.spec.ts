import { calcularCoberturas, type CoberturaTarifa } from './riesgos-generales.calculo';

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
});
