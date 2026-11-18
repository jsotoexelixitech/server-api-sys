import { porcentajeFueraDeRango, revisarFase2 } from './configurador-revision-fase2';
import { revisarPlan, type DatosRevision } from './configurador.revision';

const codigos = (items: { codigo: string; nivel: string }[], nivel?: string) =>
  items.filter((i) => !nivel || i.nivel === nivel).map((i) => i.codigo);

describe('revisarFase2', () => {
  it('personas: cada parentesco de las tarifas necesita su fila en mapledades_per', () => {
    const mal = revisarFase2('personas', { tieneInsramo: true, edades: { parentescosTarifa: [1, 2, 2, 3], parentescosEdades: [1] } });
    expect(codigos(mal, 'error')).toEqual(['EDADES_FALTAN']);
    expect(mal[0].mensaje).toMatch(/2, 3/);
    expect(mal[0].seccion).toBe('edades-parentesco');
    const bien = revisarFase2('personas', { tieneInsramo: true, edades: { parentescosTarifa: [1, 2], parentescosEdades: [2, 1, 5] } });
    expect(codigos(bien)).toEqual(['EDADES_OK']);
  });

  it('patrimonial: % de madisseg y masustac entre 0 y 100 (null no cuenta)', () => {
    const items = revisarFase2('patrimonial', {
      tieneInsramo: true,
      porcentajes: [
        { tabla: 'madisseg', codigo: 3, descripcion: 'TRANCA PALANCA', porcentaje: 10 },
        { tabla: 'masustac', codigo: 1, descripcion: 'QUIMIC.', porcentaje: 120 },
        { tabla: 'masustac', codigo: 2, descripcion: 'X', porcentaje: null },
      ],
    });
    expect(codigos(items, 'error')).toEqual(['DESCUENTO_RECARGO_RANGO']);
    expect(items[0].seccion).toBe('descuentos-recargos');
    expect(codigos(revisarFase2('patrimonial', { tieneInsramo: true, porcentajes: [] }))).toEqual([]);
  });

  it('ramo sin insramo: solo aviso; fianzas: aviso de sin emisión', () => {
    expect(revisarFase2('auto', { tieneInsramo: false }).map((i) => [i.codigo, i.nivel])).toEqual([['RAMO_SIN_INSRAMO', 'aviso']]);
    expect(codigos(revisarFase2('fianzas', { tieneInsramo: true }), 'aviso')).toEqual(['FIANZAS_SIN_EMISION']);
  });

  it('porcentajeFueraDeRango', () => {
    expect([0, 100, 55.5, null].map(porcentajeFueraDeRango)).toEqual([false, false, false, false]);
    expect([-1, 100.01, Number.NaN].map(porcentajeFueraDeRango)).toEqual([true, true, true]);
  });
});

describe('revisarPlan con fase 2', () => {
  const base = (): DatosRevision => ({
    cramo: 25,
    cplan: 'VIAJE',
    familia: 'patrimonial',
    tablaPlan: 'maplanes_per',
    cabeceras: [{ tabla: 'maplanes_per', iestado: 'V', cproducto: '1' }],
    ramosConMismoPlan: [],
    productoExiste: true,
    coberturas: [{ ccobertura: '1', ctarifa: '1', tarifaExiste: true, detallesV: 1, ccontrea: 1, cramorea: 1, cob18: null }],
    aranceles: [{ cplan: '0', ccober: '0', ctarifa: '0', iestado: 'V' }],
    frecuenciasV: [],
    usuariosPermitidos: 0,
    fase2: { tieneInsramo: true, porcentajes: [{ tabla: 'madisseg', codigo: 1, descripcion: 'X', porcentaje: 101 }] },
  });

  it('ramo mixto: revisa el plan en la tabla indicada; frecuencias y quién vende siguen siendo error', () => {
    const r = revisarPlan(base());
    expect(codigos(r.items, 'error')).toEqual(expect.arrayContaining(['FRECUENCIA_FALTA', 'CANALES_FALTAN', 'DESCUENTO_RECARGO_RANGO']));
    expect(codigos(r.items)).not.toContain('PLAN_TABLA_FAMILIA');
    expect(r.items.find((i) => i.codigo === 'CANALES_FALTAN')?.seccion).toBe('quien-vende');
    expect(r.listo).toBe(false);
  });
});
