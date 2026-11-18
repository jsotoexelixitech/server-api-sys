import {
  AVISO_COLECTIVO, AVISO_FIANZAS, AVISO_SIN_INSRAMO, clasificarRamo, emisionNexusDe, esColectivo, estadoDelRamo, familiaDelRamo,
  seccionesDeFamilia, type DatosRamo,
} from './configurador.familia';

const sinIndicadores = { tieneTiposAuto: false, tienePlanesPersonas: false };

describe('familiaDelRamo', () => {
  it('por ctiporamo: 7 auto, 2 y 4 personas, 5 fianzas, 1 y 6 patrimonial', () => {
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 7 })).toBe('auto');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 2 })).toBe('personas');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 4 })).toBe('personas');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 5 })).toBe('fianzas');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 1 })).toBe('patrimonial');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 6 })).toBe('patrimonial');
  });

  it('matipos/macattip manda sobre ctiporamo', () => {
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 6, tieneTiposAuto: true })).toBe('auto');
  });

  it('ramo 26 (RCV, ctiporamo 1): auto porque sus 9 coberturas equivalen a coberturas del ramo 18', () => {
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 1, coberturas: 9, coberturasHacia18: 9 })).toBe('auto');
  });

  it('equivalencia parcial con el ramo 18 no basta; en personas y fianzas no aplica', () => {
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 6, coberturas: 61, coberturasHacia18: 10 })).toBe('patrimonial');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 6, coberturas: 0, coberturasHacia18: 0 })).toBe('patrimonial');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 2, coberturas: 3, coberturasHacia18: 3 })).toBe('personas');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 5, coberturas: 3, coberturasHacia18: 3 })).toBe('fianzas');
  });

  it('ramo 25 (ctiporamo 6 con planes VIAJE en maplanes_per) queda patrimonial', () => {
    expect(familiaDelRamo({ ctiporamo: 6, tieneTiposAuto: false, tienePlanesPersonas: true, iplanpers: false })).toBe('patrimonial');
  });

  it('ctiporamo desconocido: regla de la fase 1 (iplanpers o maplanes_per = personas; si no, patrimonial)', () => {
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: null, iplanpers: 'True' })).toBe('personas');
    expect(familiaDelRamo({ ...sinIndicadores, iplanpers: 1 })).toBe('personas');
    expect(familiaDelRamo({ ...sinIndicadores, tienePlanesPersonas: true })).toBe('personas');
    expect(familiaDelRamo({ ...sinIndicadores, ctiporamo: 9 })).toBe('patrimonial');
  });
});

const ramo = (d: Partial<DatosRamo>): DatosRamo => ({
  ...sinIndicadores, iestado: 'V', planesVigentes: 0, tieneInsramo: true, ...d,
});

describe('esColectivo (personas sin planes en maplanes_per, vigente y con insramo)', () => {
  it('datos de Sis2000_QA: 4, 6, 8, 43, 46 sí; 1 (con planes), 2 (inactivo) y 34 (sin insramo) no', () => {
    expect(esColectivo('personas', ramo({ ctiporamo: 2 }))).toBe(true); // 4 vida colectivo
    expect(esColectivo('personas', ramo({ ctiporamo: 2, planesVigentes: 4 }))).toBe(true); // 6: planes en maplanes, no en maplanes_per
    expect(esColectivo('personas', ramo({ ctiporamo: 2, tienePlanesPersonas: true, planesVigentes: 34 }))).toBe(false);
    expect(esColectivo('personas', ramo({ ctiporamo: 2, iestado: 'N' }))).toBe(false);
    expect(esColectivo('personas', ramo({ ctiporamo: 2, tieneInsramo: false }))).toBe(false);
    expect(esColectivo('patrimonial', ramo({ ctiporamo: 6 }))).toBe(false);
  });
});

describe('emisionNexusDe', () => {
  it('auto, personas salvo colectivo, patrimonial con ctiporamo 1/6, fianzas null', () => {
    expect(emisionNexusDe('auto', false, 1)).toBe('auto');
    expect(emisionNexusDe('personas', false, 2)).toBe('personas');
    expect(emisionNexusDe('personas', true, 2)).toBeNull();
    expect(emisionNexusDe('patrimonial', false, 6)).toBe('patrimonial');
    expect(emisionNexusDe('patrimonial', false, null)).toBeNull();
    expect(emisionNexusDe('fianzas', false, 5)).toBeNull();
  });
});

describe('estadoDelRamo', () => {
  it("inactivo manda; activo con planes 'V'; si no, sin-planes", () => {
    expect(estadoDelRamo({ iestado: 'N', planesVigentes: 3 })).toBe('inactivo');
    expect(estadoDelRamo({ iestado: 'V', planesVigentes: 3 })).toBe('activo');
    expect(estadoDelRamo({ iestado: 'V ', planesVigentes: 0 })).toBe('sin-planes');
  });
});

describe('clasificarRamo', () => {
  it('ramo 30 fianzas: solo lectura, sin emisión y con su aviso', () => {
    const r = clasificarRamo({ ...ramo({ ctiporamo: 5 }), cramo: 30, xdescripcion: 'FIANZA', productos: 0 });
    expect(r).toMatchObject({ familia: 'fianzas', soloLectura: true, emisionNexus: null, estado: 'sin-planes', colectivo: false });
    expect(r.avisos).toContain(AVISO_FIANZAS);
  });

  it('colectivo con aviso (sin el de sin-planes); ramo sin insramo con su aviso', () => {
    const c = clasificarRamo({ ...ramo({ ctiporamo: 2 }), cramo: 4, xdescripcion: 'VIDA COLECTIVO', productos: 0 });
    expect(c.avisos).toEqual([AVISO_COLECTIVO]);
    const s = clasificarRamo({ ...ramo({ ctiporamo: 1, tieneInsramo: false }), cramo: 14, xdescripcion: 'RAMOS TECNICO', productos: 0 });
    expect(s.avisos).toContain(AVISO_SIN_INSRAMO);
    expect(s.emisionNexus).toBe('patrimonial');
  });
});

describe('seccionesDeFamilia', () => {
  const comunes = ['producto', 'plan', 'coberturas', 'tarifas', 'deducibles', 'frecuencias', 'quien-vende', 'comisiones'];

  it('auto: comunes + tipos-uso, tasas-antiguedad, tasa-casco y tarifa-dias antes de revision', () => {
    expect(seccionesDeFamilia('auto')).toEqual([...comunes, 'tipos-uso', 'tasas-antiguedad', 'tasa-casco', 'tarifa-dias', 'revision']);
  });

  it('personas: sin deducibles de plan, con edades, tablas de edad y proveedores', () => {
    expect(seccionesDeFamilia('personas')).toEqual([
      ...comunes.filter((s) => s !== 'deducibles'), 'edades-parentesco', 'tablas-edad', 'proveedores', 'revision',
    ]);
  });

  it('patrimonial: descuentos-recargos; condominio y tarifa-dias solo si el ramo tiene filas', () => {
    expect(seccionesDeFamilia('patrimonial')).toEqual([...comunes, 'descuentos-recargos', 'revision']);
    expect(seccionesDeFamilia('patrimonial', { condominio: true, tarifaDias: true })).toEqual([
      ...comunes, 'descuentos-recargos', 'condominio', 'tarifa-dias', 'revision',
    ]);
  });

  it('fianzas: solo las comunes', () => {
    expect(seccionesDeFamilia('fianzas')).toEqual([...comunes, 'revision']);
  });
});
