import { bfradedBd, traeDeducible, validarDeducible, validarEdicionDetalle } from './configurador.deducibles';

describe('validarDeducible', () => {
  it('acepta deducible o franquicia con montos y porcentaje en rango, y sin deducible', () => {
    expect(validarDeducible({ bfraded: 'D', mdedu_fran: 500, mdedu_franext: 10, pdedu_fran: 2 })).toEqual([]);
    expect(validarDeducible({ bfraded: 'F', pdedu_fran: 100 })).toEqual([]);
    expect(validarDeducible({ bfraded: null, mdedu_fran: 0 })).toEqual([]);
    expect(validarDeducible({})).toEqual([]);
  });

  it('rechaza negativos, porcentaje > 100 y códigos desconocidos', () => {
    const errores = validarDeducible({ bfraded: 'X', mdedu_fran: -1, pdedu_fran: 101 }).join(' ');
    expect(errores).toMatch(/bfraded/);
    expect(errores).toMatch(/mdedu_fran no puede ser negativo/);
    expect(errores).toMatch(/pdedu_fran debe estar entre 0 y 100/);
  });

  it('pide D o F cuando hay monto y bfraded viene en null', () => {
    expect(validarDeducible({ bfraded: null, mdedu_fran: 300 }).join(' ')).toMatch(/indica bfraded/);
  });
});

describe('traeDeducible / bfradedBd', () => {
  it('null no cuenta como dato de deducible', () => {
    expect(traeDeducible({ bfraded: null })).toBe(false);
    expect(traeDeducible({ mdedu_fran: 0 })).toBe(true);
  });

  it("sin deducible se guarda '0'", () => {
    expect(bfradedBd(null)).toBe('0');
    expect(bfradedBd(undefined)).toBe('0');
    expect(bfradedBd('F')).toBe('F');
  });
});

describe('validarEdicionDetalle', () => {
  it('suma mínima ≤ máxima y cierre no anterior al inicio', () => {
    expect(validarEdicionDetalle('2026-01-01', { msumamin: 10, msumamax: 5 }).join(' ')).toMatch(/msumamin/);
    expect(validarEdicionDetalle('2026-01-01', { fhasta: '2025-12-31' }).join(' ')).toMatch(/fhasta/);
    expect(validarEdicionDetalle('2026-01-01', { fhasta: '2026-06-30', msumamin: 1, msumamax: 1 })).toEqual([]);
  });
});
