import { reconstruirPlan, type FilasPlan } from './configurador.plan-lectura';
import { validarPlan, type PlanRegla } from './configurador.reglas';

const vacio = (): FilasPlan => ({
  maplanes: [], maplanes_per: [], maplantar: [], maplcober_per: [], mapltarifas_per: [], mapledades_per: [], maplanes_frec: [], mausuplan: [],
});

describe('reconstruirPlan', () => {
  it('devuelve null si el plan no existe', () => {
    expect(reconstruirPlan(vacio())).toBeNull();
  });

  it('cosas: cabecera, maplantar, frecuencias y productores/canales de mausuplan', () => {
    const filas: FilasPlan = {
      ...vacio(),
      maplanes: [{
        cramo: 28, cplan: 'PBT1  ', xplan: 'PLAN PRUEBA  ', cproducto: '89  ', cmoneda: '$  ', itiporen: 'A',
        fdesde: new Date('2026-01-01T00:00:00Z'), fhasta: new Date('2099-12-31T00:00:00Z'), ctipo: null, bnacional: true,
      }],
      maplantar: [
        { cramo: 28, cplan: 'PBT1', ccober: '1   ', ctarifa: '1   ', msumamin: 0, msumamax: 50000, mprima: 0, pprima: 0.5 },
        { cramo: 28, cplan: 'PBT1', ccober: '2   ', ctarifa: '1   ', msumamin: 0, msumamax: 10000, mprima: 20, pprima: 0 },
      ],
      maplanes_frec: [{ ifrecuencia: 'A', xfrecuencia: 'Anual', ndias: 365 }],
      mausuplan: [
        { centidad: 'P', citem: '80080', itipouso: 'A' },
        { centidad: 'P', citem: '215', itipouso: 'A' },
        { centidad: 'C', citem: '8', itipouso: 'A' },
      ],
    };
    const r = reconstruirPlan(filas)!;
    expect(r.type).toBe('cosas');
    expect(r.plan).toMatchObject({
      type: 'cosas', cramo: 28, cplan: 'PBT1', xplan: 'PLAN PRUEBA', cproducto: '89', cmoneda: '$', fdesde: '2026-01-01',
      fhasta: '2099-12-31', bnacional: true, all_productor: false, productores: [80080, 215], all_canal: false, canales: [8],
      frecuencias: [{ ifrecuencia: 'A', xfrecuencia: 'Anual', ndias: 365 }],
    });
    expect(r.plan.coberturas).toEqual([
      { ccobertura: '1', ctarifa: '1', msumamin: 0, msumamax: 50000, mprima: 0, pprima: 0.5 },
      { ccobertura: '2', ctarifa: '1', msumamin: 0, msumamax: 10000, mprima: 20, pprima: 0 },
    ]);
    expect(r.plan).not.toHaveProperty('ctipo');
    expect(r.advertencias).toEqual([]);
    expect(validarPlan(r.plan as unknown as PlanRegla)).toEqual([]);
  });

  it('citem NULL en mausuplan = todos; exclusiones y gestores se informan', () => {
    const r = reconstruirPlan({
      ...vacio(),
      maplanes: [{ cramo: 28, cplan: 'X1', xplan: 'X', cproducto: '89', fdesde: '2026-01-01', fhasta: null }],
      maplantar: [{ ccober: '1', ctarifa: '1', msumamax: 100, mprima: 1 }],
      maplanes_frec: [{ ifrecuencia: 'A', xfrecuencia: 'Anual' }, { ifrecuencia: 'A', xfrecuencia: 'Anual', ndias: 30 }],
      mausuplan: [
        { centidad: 'P', citem: null, itipouso: 'A' },
        { centidad: 'C', citem: null, itipouso: 'A' },
        { centidad: 'P', citem: '999', itipouso: 'E' },
        { centidad: 'G', citem: '348-342', itipouso: 'A' },
      ],
    })!;
    expect(r.plan).toMatchObject({ all_productor: true, productores: [], all_canal: true, canales: [], fhasta: '2099-12-31' });
    expect(r.plan.frecuencias).toHaveLength(1);
    const adv = r.advertencias.join(' ');
    expect(adv).toMatch(/fhasta/);
    expect(adv).toMatch(/exclusión/);
    expect(adv).toMatch(/gestores G/);
    expect(adv).toMatch(/repite la frecuencia A/);
  });

  it('personas: coberturas, parentescos con tabla de tasas y edades', () => {
    const r = reconstruirPlan({
      ...vacio(),
      maplanes_per: [{ cramo: 1, cplan: 'TEMP1A', xplan: 'VIDA', cproducto: '76', fdesde: '2026-01-01', fhasta: '2099-12-31' }],
      maplcober_per: [{ ccobertura: '1 ', ctarifa: '1', bobligatoria: true }],
      mapltarifas_per: [{ ccobertura: '1', cparen: 1, csexo: 'A', ctablatar: 'TEMP1 ', msuma: 5000, msumamax: 5000, mprima: 0 }],
      mapledades_per: [{ cparen: 1, cemin_ase: 18, cemax_ase: 70 }],
      maplanes_frec: [{ ifrecuencia: 'M', xfrecuencia: 'Mensual' }],
      mausuplan: [{ centidad: 'P', citem: '80080', itipouso: 'A' }],
    })!;
    expect(r.type).toBe('personas');
    expect(r.plan.coberturas).toEqual([{
      ccobertura: '1', ctarifa: '1', bobligatoria: true,
      parentescos: [{ cparen: 1, csexo: 'A', ctablatar: 'TEMP1', nedad_min: 18, nedad_max: 70, msuma: 5000, msumamax: 5000, mprima: 0 }],
    }]);
    expect(r.advertencias).toEqual([]);
    expect(validarPlan(r.plan as unknown as PlanRegla)).toEqual([]);
  });

  it('personas sin ctarifa ni edades: no inventa valores y lo advierte', () => {
    const r = reconstruirPlan({
      ...vacio(),
      maplanes_per: [{ cramo: 1, cplan: 'P2', xplan: 'VIDA', cproducto: '76', fdesde: '2026-01-01', fhasta: '2099-12-31' }],
      maplcober_per: [{ ccobertura: '3' }],
      mapltarifas_per: [{ ccobertura: '3', cparen: 2, ctablatar: 'T2' }],
    })!;
    const cob = (r.plan.coberturas as Record<string, unknown>[])[0];
    expect(cob).not.toHaveProperty('ctarifa');
    expect((cob.parentescos as Record<string, unknown>[])[0]).not.toHaveProperty('nedad_min');
    const adv = r.advertencias.join(' ');
    expect(adv).toMatch(/no se encontró la tarifa/);
    expect(adv).toMatch(/sin edades/);
    expect(adv).toMatch(/csexo/);
  });
});
