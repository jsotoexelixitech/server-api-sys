import { validarPlan, validarProveedorPlan, validarTramos, type PlanRegla } from './configurador.reglas';

describe('validarProveedorPlan', () => {
  const vigente = { cci_rif: 311624457, cclave_num: 1, fdesde: '2023-01-01', fhasta: '2040-12-31' };

  it('acepta otra clave u otro proveedor aunque las fechas coincidan, y una vigencia posterior a la baja', () => {
    expect(validarProveedorPlan({ ...vigente, cclave_num: 2 }, [vigente])).toEqual([]);
    expect(validarProveedorPlan({ ...vigente, cci_rif: 1 }, [vigente])).toEqual([]);
    expect(validarProveedorPlan({ cci_rif: 311624457, cclave_num: 1, fdesde: '2041-01-01' }, [vigente])).toEqual([]);
  });

  it('rechaza vigencias que se solapan (también sin fecha hasta), fechas invertidas y costo negativo', () => {
    expect(validarProveedorPlan({ cci_rif: 311624457, cclave_num: 1, fdesde: '2030-01-01' }, [vigente]).join(' ')).toMatch(/se solapa/);
    expect(validarProveedorPlan({ ...vigente, fdesde: '2050-01-01' }, [{ ...vigente, fhasta: null }]).join(' ')).toMatch(/invertid|posterior/);
    expect(validarProveedorPlan({ cci_rif: 9, cclave_num: 1, fdesde: '2026-01-01', mcostoext: -1 }, []).join(' ')).toMatch(/negativo/);
  });
});

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

  it('con suma_calculada acepta cosas con msumamax 0 y sin prima ni tasa; sin el flag las rechaza', () => {
    const calculada = { ccobertura: '980', ctarifa: '1', msumamin: 0, msumamax: 0, mprima: 0, pprima: 0 };
    expect(validarPlan({ ...cosas, coberturas: [{ ...calculada, suma_calculada: true }] })).toEqual([]);
    expect(validarPlan({ ...cosas, coberturas: [{ ...calculada, suma_calculada: false }] }).join(' ')).toMatch(/msumamax/);
    expect(validarPlan({ ...cosas, coberturas: [calculada] }).join(' ')).toMatch(/prima \(mprima\) o tasa/);
    expect(validarPlan({ ...cosas, coberturas: [{ ...calculada, suma_calculada: true, msumamin: 10 }] }).join(' ')).toMatch(/msumamin/);
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
