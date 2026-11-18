import { familiaDelRamo, seccionesDeFamilia } from './configurador.familia';

describe('familiaDelRamo', () => {
  it('auto manda sobre personas', () => {
    expect(familiaDelRamo({ tieneTiposAuto: true, iplanpers: true, tienePlanesPersonas: true })).toBe('auto');
  });

  it('personas por iplanpers (bit en cualquier forma) o por planes en maplanes_per', () => {
    expect(familiaDelRamo({ tieneTiposAuto: false, iplanpers: true, tienePlanesPersonas: false })).toBe('personas');
    expect(familiaDelRamo({ tieneTiposAuto: false, iplanpers: 1, tienePlanesPersonas: false })).toBe('personas');
    expect(familiaDelRamo({ tieneTiposAuto: false, iplanpers: null, tienePlanesPersonas: true })).toBe('personas');
  });

  it('cosas en cualquier otro caso', () => {
    expect(familiaDelRamo({ tieneTiposAuto: false, iplanpers: false, tienePlanesPersonas: false })).toBe('cosas');
    expect(familiaDelRamo({ tieneTiposAuto: false, iplanpers: 0, tienePlanesPersonas: false })).toBe('cosas');
  });
});

describe('seccionesDeFamilia', () => {
  it('orden fijo y revision al final', () => {
    expect(seccionesDeFamilia('cosas')).toEqual(['coberturas', 'tarifas', 'deducibles', 'frecuencias', 'canales', 'comisiones', 'revision']);
    expect(seccionesDeFamilia('personas')).toEqual(seccionesDeFamilia('cosas'));
  });

  it('auto agrega tipos-uso y tasas-antiguedad antes de revision', () => {
    expect(seccionesDeFamilia('auto')).toEqual([
      'coberturas', 'tarifas', 'deducibles', 'frecuencias', 'canales', 'comisiones', 'tipos-uso', 'tasas-antiguedad', 'revision',
    ]);
  });
});
