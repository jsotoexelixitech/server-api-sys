import {
  avisosCabecera, edicionTarifaPlan, esUltimaObligatoria, sexoTarifa, tarifaObligatoria, validarCabeceraPlan, validarCoberturaCosas,
  validarCoberturaPersonas, validarMontosTarifa,
} from './configurador.plan-edicion';

describe('validarCabeceraPlan', () => {
  it('exige al menos un campo y valida largos e iestado', () => {
    expect(validarCabeceraPlan({}).join(' ')).toMatch(/No hay campos/);
    expect(validarCabeceraPlan({ xplan: 'PLAN', cmoneda: '$', cproducto: 'PRB01', iestado: 'I' })).toEqual([]);
    expect(validarCabeceraPlan({ xplan: 'x'.repeat(61) }).join(' ')).toMatch(/xplan admite hasta 60/);
    expect(validarCabeceraPlan({ cmoneda: '' }).join(' ')).toMatch(/cmoneda no puede quedar vacío/);
    expect(validarCabeceraPlan({ iestado: 'N' }).join(' ')).toMatch(/'V' o 'I'/);
  });

  it('avisa producto largo o de otro ramo', () => {
    expect(avisosCabecera('PRB01', 28, 28)).toEqual([]);
    expect(avisosCabecera('PRODUCTO1', 28, 28).join(' ')).toMatch(/más de 6/);
    expect(avisosCabecera('PRB01', 18, 28).join(' ')).toMatch(/ramo 18, no del 28/);
  });
});

describe('montos de la tarifa del plan', () => {
  it('rechaza negativos, mínimo > máximo y prima con tasa', () => {
    expect(validarMontosTarifa({ msumamin: -1 }).join(' ')).toMatch(/msumamin/);
    expect(validarMontosTarifa({ msumamin: 10, msumamax: 5 }).join(' ')).toMatch(/mayor que msumamax/);
    expect(validarMontosTarifa({ msumamin: 10, msumamax: 0 })).toEqual([]);
    expect(validarMontosTarifa({ mprima: 10, pprima: 1 }).join(' ')).toMatch(/excluyentes/);
    expect(validarMontosTarifa({ pprima: 101 }).join(' ')).toMatch(/100/);
  });

  it('al poner prima la tasa pasa a 0 y viceversa', () => {
    expect(edicionTarifaPlan({ mprima: 25 })).toMatchObject({ errores: [], campos: { mprima: 25, pprima: 0 } });
    expect(edicionTarifaPlan({ pprima: 1.5 }).campos).toEqual({ pprima: 1.5, mprima: 0 });
    expect(edicionTarifaPlan({ pprima: 1.5 }).ajustes.join(' ')).toMatch(/mprima pasó a 0/);
    expect(edicionTarifaPlan({ msumamax: 1000 })).toMatchObject({ campos: { msumamax: 1000 }, ajustes: [] });
    expect(edicionTarifaPlan({ mprima: 0, pprima: 0 }).campos).toEqual({ mprima: 0, pprima: 0 });
    expect(edicionTarifaPlan({}).errores.join(' ')).toMatch(/No hay campos/);
  });

  it('cobertura de cosas: códigos de 1 a 4', () => {
    expect(validarCoberturaCosas({ ccobertura: '1', ctarifa: '1', mprima: 10 })).toEqual([]);
    expect(validarCoberturaCosas({ ccobertura: '', ctarifa: '12345' }).join(' ')).toMatch(/ccobertura.*ctarifa/);
  });
});

describe('obligatorias', () => {
  it('matarifa.bobligatoria T o 1', () => {
    expect(['T', '1', 't'].map(tarifaObligatoria)).toEqual([true, true, true]);
    expect(['F', '0', '', null].map(tarifaObligatoria)).toEqual([false, false, false, false]);
  });

  it('bloquea la baja de la última obligatoria', () => {
    const activas = [{ ccober: '1', obligatoria: true }, { ccober: '2', obligatoria: false }];
    expect(esUltimaObligatoria(activas, '1')).toBe(true);
    expect(esUltimaObligatoria(activas, '2')).toBe(false);
    expect(esUltimaObligatoria([...activas, { ccober: '3', obligatoria: true }], '1')).toBe(false);
    expect(esUltimaObligatoria([{ ccober: '2', obligatoria: false }], '2')).toBe(false);
  });
});

describe('validarCoberturaPersonas', () => {
  const ok = { ccobertura: '1', ctarifa: '1', parentescos: [{ cparen: 1, ctablatar: 'C003' }, { cparen: 2, ctablatar: 'C003', csexo: 'f' }] };

  it('acepta parentescos con tabla; sexo por defecto A', () => {
    expect(validarCoberturaPersonas(ok)).toEqual([]);
    expect(sexoTarifa(undefined)).toBe('A');
    expect(sexoTarifa(' f ')).toBe('F');
  });

  it('exige parentescos, tabla y sin repetidos', () => {
    expect(validarCoberturaPersonas({ ...ok, parentescos: [] }).join(' ')).toMatch(/al menos un parentesco/);
    expect(validarCoberturaPersonas({ ...ok, parentescos: [{ cparen: 1, ctablatar: '' }] }).join(' ')).toMatch(/ctablatar/);
    expect(validarCoberturaPersonas({ ...ok, parentescos: [{ cparen: 1, ctablatar: 'C1' }, { cparen: 1, ctablatar: 'C2', csexo: 'A' }] }).join(' '))
      .toMatch(/repetido/);
    expect(validarCoberturaPersonas({ ...ok, parentescos: [{ cparen: 1, ctablatar: 'C1', csexo: 'X' }] }).join(' ')).toMatch(/A, M o F/);
  });
});
