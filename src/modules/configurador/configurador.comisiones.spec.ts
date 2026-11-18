import { aplicaA, duplicadosVigentes, validarBajaComision, validarComision } from './configurador.comisiones';

describe('validarComision', () => {
  const ok = { ctipoprod: 0, cproductor: 0, ccober: '0', ctarifa: '0', fdesde: '2026-01-01', pcomision: 15 };

  it('acepta comodines y porcentajes en el rango', () => {
    expect(validarComision(ok)).toEqual([]);
    expect(validarComision({ ...ok, pcomision: 0 })).toEqual([]);
    expect(validarComision({ ...ok, pcomision: 100 })).toEqual([]);
    expect(validarComision({ ...ok, pcomision: 12.5, ccober: '1', ctarifa: '1', cproductor: 80080 })).toEqual([]);
  });

  it('rechaza porcentaje fuera de 0-100 o con más de 2 decimales', () => {
    expect(validarComision({ ...ok, pcomision: -1 }).join(' ')).toMatch(/entre 0 y 100/);
    expect(validarComision({ ...ok, pcomision: 100.01 }).join(' ')).toMatch(/entre 0 y 100/);
    expect(validarComision({ ...ok, pcomision: 10.123 }).join(' ')).toMatch(/2 decimales/);
  });

  it('rechaza códigos vacíos o largos, productor negativo y fecha inválida', () => {
    const errores = validarComision({ ...ok, ccober: '', ctarifa: '12345', cproductor: -5, fdesde: '01/01/2026' }).join(' ');
    expect(errores).toMatch(/ccober/);
    expect(errores).toMatch(/ctarifa/);
    expect(errores).toMatch(/cproductor/);
    expect(errores).toMatch(/fdesde/);
  });
});

describe('validarBajaComision', () => {
  it('fhasta igual o posterior a fdesde', () => {
    expect(validarBajaComision('2026-01-01', '2026-01-01')).toEqual([]);
    expect(validarBajaComision('2026-01-01', '2025-12-31').join(' ')).toMatch(/anterior/);
    expect(validarBajaComision('2026-01-01', 'mañana').join(' ')).toMatch(/fecha/);
  });
});

describe('aplicaA', () => {
  it("cplan '0' (CHAR con espacios) es del ramo", () => {
    expect(aplicaA('0     ')).toBe('ramo');
    expect(aplicaA('RCV01 ')).toBe('plan');
  });
});

describe('duplicadosVigentes', () => {
  const filas = [
    { cplan: 'A', ccober: '1', ctarifa: '1', iestado: 'V' },
    { cplan: 'B', ccober: '1', ctarifa: '2', iestado: 'V' },
    { cplan: 'A', ccober: '2', ctarifa: '1', iestado: 'V' },
    { cplan: 'A', ccober: '2', ctarifa: '3', iestado: 'I' },
    { cplan: '0', ccober: '0', ctarifa: '0', iestado: 'V' },
    { cplan: '0', ccober: '0', ctarifa: '0', iestado: 'V' },
    { cplan: 'A', ccober: '3', ctarifa: '9', iestado: 'N' },
    { cplan: 'B', ccober: '3', ctarifa: '9', iestado: 'V' },
  ];

  it('cuenta solo filas V, ignora el comodín 0 y los estados I/N', () => {
    expect(duplicadosVigentes(filas, 'ccober')).toEqual([{ codigo: '1', filas: 2 }]);
    expect(duplicadosVigentes(filas, 'ctarifa')).toEqual([{ codigo: '1', filas: 2 }]);
  });

  it('se limita a los códigos pedidos', () => {
    expect(duplicadosVigentes(filas, 'ccober', ['2', '3'])).toEqual([]);
  });
});
