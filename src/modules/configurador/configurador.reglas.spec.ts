import { validarPlan, validarTramos, type PlanRegla } from './configurador.reglas';

describe('validarTramos', () => {
  it('acepta tramos contiguos con tasa', () => {
    expect(validarTramos([
      { nedad_min: 41, nedad_max: 55, pprima: 1.108 },
      { nedad_min: 18, nedad_max: 40, pprima: 0.449 },
      { nedad_min: 56, nedad_max: 70, pprima: 3.636 },
    ])).toEqual([]);
  });

  it('rechaza solapes, edades invertidas y tramos sin tasa', () => {
    const errores = validarTramos([
      { nedad_min: 18, nedad_max: 40, pprima: 0.449 },
      { nedad_min: 40, nedad_max: 55, pprima: 1.1 },
      { nedad_min: 60, nedad_max: 56, pprima: 0 },
    ]);
    expect(errores).toHaveLength(3);
    expect(errores.join(' ')).toMatch(/se solapa/);
    expect(errores.join(' ')).toMatch(/mínima es mayor/);
    expect(errores.join(' ')).toMatch(/necesita tasa/);
  });
});

describe('validarPlan', () => {
  const cosas: PlanRegla = {
    type: 'cosas', fdesde: '2026-01-01', fhasta: '2099-12-31', productores: [80080],
    coberturas: [{ ccobertura: '980', ctarifa: '1', msumamin: 1000, msumamax: 50000, mprima: 50 }],
    frecuencias: [{ ifrecuencia: 'A' }],
  };

  it('acepta un plan de cosas con prima fija o con tasa', () => {
    expect(validarPlan(cosas)).toEqual([]);
    expect(validarPlan({ ...cosas, coberturas: [{ ccobertura: '980', ctarifa: '1', msumamax: 50000, pprima: 0.5 }] })).toEqual([]);
  });

  it('rechaza cosas sin suma, sin prima ni tasa, y sin productores', () => {
    const errores = validarPlan({
      ...cosas, productores: [],
      coberturas: [{ ccobertura: '980', ctarifa: '1', msumamax: 0 }],
    });
    expect(errores.join(' ')).toMatch(/productores/);
    expect(errores.join(' ')).toMatch(/msumamax/);
    expect(errores.join(' ')).toMatch(/prima \(mprima\) o tasa/);
  });

  it('exige parentescos con edades válidas en personas', () => {
    const personas: PlanRegla = {
      type: 'personas', fdesde: '2026-01-01', fhasta: '2099-12-31', all_productor: true,
      coberturas: [
        { ccobertura: '1', ctarifa: '1', parentescos: [{ cparen: 1, csexo: 'A', nedad_min: 18, nedad_max: 70 }] },
        { ccobertura: '3', ctarifa: '1', parentescos: [] },
        { ccobertura: '4', ctarifa: '1', parentescos: [{ cparen: 1, csexo: 'A', nedad_min: 70, nedad_max: 18 }] },
      ],
      frecuencias: [{ ifrecuencia: 'A' }, { ifrecuencia: 'a' }],
    };
    const errores = validarPlan(personas);
    expect(errores.join(' ')).toMatch(/Cobertura 3: agrega al menos un parentesco/);
    expect(errores.join(' ')).toMatch(/Cobertura 4, parentesco 1/);
    expect(errores.join(' ')).toMatch(/frecuencias repetidas/);
  });
});
