import { pick } from './sync-row.utils';

describe('pick', () => {
  it('devuelve el valor de la primera clave que existe, respetando el orden pedido', () => {
    expect(pick({ b: 2, a: 1 }, 'a', 'b')).toBe(1);
    expect(pick({ b: 2 }, 'a', 'b')).toBe(2);
  });

  it('busca sin distinguir mayúsculas cuando la clave exacta no existe', () => {
    expect(pick({ Numero_Poliza: 'P-1' }, 'poliza', 'numero_poliza')).toBe('P-1');
    expect(pick({ FECHA_DESDE: '2026-01-01' }, 'fecha_desde')).toBe('2026-01-01');
  });

  it('una clave exacta con valor null se devuelve tal cual (no se salta a la siguiente)', () => {
    expect(pick({ a: null, b: 2 }, 'a', 'b')).toBeNull();
  });

  it('si no hay ninguna clave devuelve undefined; filas vacías o inválidas también', () => {
    expect(pick({ x: 1 }, 'a', 'b')).toBeUndefined();
    expect(pick(null, 'a')).toBeUndefined();
    expect(pick(undefined, 'a')).toBeUndefined();
  });

  it('reutiliza el índice de la fila: miles de llamadas sobre la misma fila son baratas', () => {
    const fila: Record<string, unknown> = {};
    for (let i = 0; i < 40; i += 1) fila[`COL_${i}`] = i;
    const t0 = Date.now();
    for (let i = 0; i < 20000; i += 1) pick(fila, 'x', 'col_39');
    expect(pick(fila, 'col_39')).toBe(39);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
