import { avisosCoberturaEdades, huecosEdad, valoresAltaEdades, validarEdades } from './configurador.edades';

describe('validarEdades', () => {
  it('exige edades del asegurado con mín ≤ máx', () => {
    expect(validarEdades({ cemin_ase: 18, cemax_ase: 74 })).toEqual([]);
    expect(validarEdades({ cemin_ase: 18 }).join(' ')).toMatch(/obligatorias/);
    expect(validarEdades({ cemin_ase: 75, cemax_ase: 74 }).join(' ')).toMatch(/cemin_ase no puede ser mayor/);
    expect(validarEdades({ cemin_ase: 0, cemax_ase: 74, cemin_gi: 30, cemax_gi: 20 }).join(' ')).toMatch(/cemin_gi/);
  });

  it('edades enteras 0-255 (TINYINT) y montos ≥ 0', () => {
    expect(validarEdades({ cemin_ase: 0, cemax_ase: 256 }).join(' ')).toMatch(/cemax_ase debe ser un entero entre 0 y 255/);
    expect(validarEdades({ cemin_ase: 0, cemax_ase: 70, cereduccion: 1.5 }).join(' ')).toMatch(/cereduccion/);
    expect(validarEdades({ cemin_ase: 0, cemax_ase: 70, msvitalicia: -1 }).join(' ')).toMatch(/msvitalicia/);
  });

  it('el alta completa con los valores de spMantPlanes', () => {
    expect(valoresAltaEdades({ cemin_ase: 18, cemax_ase: 74 })).toEqual({
      cemin_ase: 18, cemax_ase: 74, cemin_gi: 18, cemax_gi: 74, msvitalicia: 0, msvitaliciaext: 0, cereduccion: 74, msreducida: 0, msreducidaext: 0,
    });
    expect(valoresAltaEdades({ cemin_ase: 0, cemax_ase: 25, cemax_gi: 21, msreducida: 500 })).toMatchObject({ cemax_gi: 21, msreducida: 500, cereduccion: 25 });
  });
});

describe('huecosEdad', () => {
  it('sin huecos cuando los tramos cubren el rango', () => {
    expect(huecosEdad([{ nedad_min: 0, nedad_max: 74 }], 18, 74)).toEqual([]);
    expect(huecosEdad([{ nedad_min: 18, nedad_max: 40 }, { nedad_min: 41, nedad_max: 74 }], 18, 74)).toEqual([]);
  });

  it('detecta huecos al inicio, en medio y al final (tramos desordenados o solapados)', () => {
    const tramos = [{ nedad_min: 50, nedad_max: 60 }, { nedad_min: 20, nedad_max: 30 }, { nedad_min: 25, nedad_max: 40 }];
    expect(huecosEdad(tramos, 18, 70)).toEqual([{ desde: 18, hasta: 19 }, { desde: 41, hasta: 49 }, { desde: 61, hasta: 70 }]);
    expect(huecosEdad([], 0, 10)).toEqual([{ desde: 0, hasta: 10 }]);
    expect(huecosEdad([{ nedad_min: 5, nedad_max: null }], 5, 6)).toEqual([{ desde: 6, hasta: 6 }]);
  });
});

describe('avisosCoberturaEdades', () => {
  it('avisa por tabla que no cubre y cuando el parentesco no tiene tarifas', () => {
    const tablas = { C003: [{ nedad_min: 0, nedad_max: 74 }], C010: [{ nedad_min: 0, nedad_max: 64 }] };
    expect(avisosCoberturaEdades(tablas, 1, 18, 74)).toEqual([
      'La tabla de tasas C010 (parentesco 1) no cubre las edades 65-74: en esas edades la cobertura no se cotiza.',
    ]);
    expect(avisosCoberturaEdades({ C003: [{ nedad_min: 0, nedad_max: 74 }] }, 1, 18, 74)).toEqual([]);
    expect(avisosCoberturaEdades({}, 3, 0, 25).join(' ')).toMatch(/no tiene tarifas/);
  });
});
