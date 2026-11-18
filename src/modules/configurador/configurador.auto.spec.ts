import { avisosTramosAntiguedad, equivalenteRamo18, esCasco, validarTipoUso, validarTramosAntiguedad } from './configurador.auto';

describe('validarTramosAntiguedad', () => {
  it('acepta tramos contiguos desde 0 (en cualquier orden) y la lista vacía', () => {
    expect(validarTramosAntiguedad([
      { desde: 6, hasta: 10, pprima: 3.1 },
      { desde: 0, hasta: 5, pprima: 2.5 },
      { desde: 11, hasta: 99, pprima: 4 },
    ])).toEqual([]);
    expect(validarTramosAntiguedad([{ desde: 0, hasta: 0, pprima: 1 }])).toEqual([]);
    expect(validarTramosAntiguedad([])).toEqual([]);
  });

  it('datos reales (18/RIES1 y RIES2): -1..2, 3..6, 7..11 es válido (-1 = vehículo del año siguiente)', () => {
    expect(validarTramosAntiguedad([
      { desde: -1, hasta: 2, pprima: 4 },
      { desde: 3, hasta: 6, pprima: 4.2 },
      { desde: 7, hasta: 11, pprima: 5 },
    ])).toEqual([]);
  });

  it('exige empezar en -1 o 0', () => {
    expect(validarTramosAntiguedad([{ desde: 1, hasta: 5, pprima: 2 }]).join(' ')).toMatch(/empezar en -1 .* o en 0/);
    expect(validarTramosAntiguedad([{ desde: -2, hasta: 5, pprima: 2 }]).join(' ')).toMatch(/enteros entre -1 y 32767/);
  });

  it('detecta huecos y solapes', () => {
    expect(validarTramosAntiguedad([
      { desde: 0, hasta: 5, pprima: 2 },
      { desde: 7, hasta: 10, pprima: 2 },
    ]).join(' ')).toMatch(/Hueco entre 5 y 7/);
    expect(validarTramosAntiguedad([
      { desde: 0, hasta: 5, pprima: 2 },
      { desde: 5, hasta: 10, pprima: 2 },
    ]).join(' ')).toMatch(/se solapa/);
  });

  it('avisa (no es error) si el último tramo no llega a una antigüedad alta', () => {
    const tramos = [{ desde: -1, hasta: 2, pprima: 4 }, { desde: 3, hasta: 11, pprima: 5 }];
    expect(avisosTramosAntiguedad(tramos).join(' ')).toMatch(/más de 11 años no podrán cotizar.*99012/);
    expect(avisosTramosAntiguedad([{ desde: 0, hasta: 99, pprima: 1 }])).toEqual([]);
    expect(avisosTramosAntiguedad([])).toEqual([]);
  });

  it('rechaza hasta < desde, tasa 0 y valores fuera de smallint', () => {
    const errores = validarTramosAntiguedad([
      { desde: 0, hasta: 3, pprima: 0 },
      { desde: 4, hasta: 2, pprima: 1 },
      { desde: 5, hasta: 40000, pprima: 1 },
    ]).join(' ');
    expect(errores).toMatch(/tasa \(pprima\) debe ser mayor a 0/);
    expect(errores).toMatch(/hasta es menor que desde/);
    expect(errores).toMatch(/enteros entre -1 y 32767/);
  });
});

describe('equivalenteRamo18 / esCasco', () => {
  const ramo18 = [
    { ccobertura: '1   ', ccoberturaint: 101 },
    { ccobertura: '2', ccoberturaint: 102 },
    { ccobertura: '28', ccoberturaint: 128 },
    { ccobertura: '6', ccoberturaint: 106 },
    { ccobertura: '30', ccoberturaint: 106 },
  ];

  it('en el ramo 18 cada cobertura es su propio equivalente', () => {
    expect(equivalenteRamo18(18, { ccobertura: '2 ', ccoberturaint: null }, ramo18)).toBe(2);
  });

  it('en otro ramo usa la menor cobertura del 18 con el mismo ccoberturaint', () => {
    expect(equivalenteRamo18(26, { ccobertura: '1', ccoberturaint: 101 }, ramo18)).toBe(1);
    expect(equivalenteRamo18(26, { ccobertura: '7', ccoberturaint: 106 }, ramo18)).toBe(6);
    expect(equivalenteRamo18(26, { ccobertura: '9', ccoberturaint: 999 }, ramo18)).toBeNull();
    expect(equivalenteRamo18(26, { ccobertura: '9', ccoberturaint: null }, ramo18)).toBeNull();
  });

  it('casco = 1, 2 o 28 del ramo 18', () => {
    expect([1, 2, 28].every(esCasco)).toBe(true);
    expect(esCasco(6)).toBe(false);
    expect(esCasco(null)).toBe(false);
  });
});

describe('validarTipoUso', () => {
  it('acepta valores en rango y nulos', () => {
    expect(validarTipoUso({ mprimbas: 12.5, pdescuento: 0, precarofic: 100, qmaxptos: 5, qmaxton: 0, msumapers: null })).toEqual([]);
  });

  it('rechaza porcentajes fuera de 0-100, montos negativos y cantidades fuera de rango', () => {
    const errores = validarTipoUso({ ptasaexc: 101, pdescuento: -1, mprimext: -0.01, qmaxptos: 256, qmaxton: 1.5 }).join(' ');
    expect(errores).toMatch(/ptasaexc debe estar entre 0 y 100/);
    expect(errores).toMatch(/pdescuento debe estar entre 0 y 100/);
    expect(errores).toMatch(/mprimext no puede ser negativo/);
    expect(errores).toMatch(/qmaxptos debe ser un entero entre 0 y 255/);
    expect(errores).toMatch(/qmaxton debe ser un entero/);
  });
});
