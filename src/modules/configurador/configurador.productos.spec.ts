import { COLUMNAS_PRODUCTO, filaProducto, filtroProductos } from './configurador.productos';

describe('filaProducto', () => {
  it('recorta los CHAR, convierte bits y numéricos y da la fecha en ISO', () => {
    const p = filaProducto({
      cproducto: 'RCVNEX' + ' '.repeat(34),
      cramo: 18,
      xdescripcion_l: 'RCV NEXUS   ',
      xabreviatura: 'RCV  ',
      iproductor: true,
      icanal: 0,
      igestor: null,
      xform: 'automobile',
      bok: 'S',
      fingreso: new Date('2026-08-31T10:00:00.000Z'),
      cusuario: '20364172',
      ctiporamo: 7,
      norden: null,
    });
    expect(p.cproducto).toBe('RCVNEX');
    expect(p.cramo).toBe(18);
    expect(p.xdescripcion_l).toBe('RCV NEXUS');
    expect(p.xabreviatura).toBe('RCV');
    expect(p.iproductor).toBe(true);
    expect(p.icanal).toBe(false);
    expect(p.igestor).toBe(false);
    expect(p.xform).toBe('automobile');
    expect(p.bok).toBe('S');
    expect(p.fingreso).toBe('2026-08-31T10:00:00.000Z');
    expect(p.cusuario).toBe(20364172);
    expect(p.norden).toBeNull();
    expect(p.xdescripcion_c).toBeNull();
  });

  it('devuelve todas las columnas de maproductos (mismos nombres que la lista partner)', () => {
    expect(Object.keys(filaProducto({})).sort()).toEqual([...COLUMNAS_PRODUCTO].sort());
  });

  it('nombre y abreviatura vacíos quedan como texto vacío, no null', () => {
    const p = filaProducto({ cproducto: 'X1', xdescripcion_l: null, xabreviatura: '   ' });
    expect(p.xdescripcion_l).toBe('');
    expect(p.xabreviatura).toBe('');
  });
});

describe('filtroProductos', () => {
  it('ramo positivo o null; texto recortado', () => {
    expect(filtroProductos(28, '  rcv ')).toEqual({ cramo: 28, q: 'rcv' });
    expect(filtroProductos(undefined, undefined)).toEqual({ cramo: null, q: '' });
    expect(filtroProductos(0, null)).toEqual({ cramo: null, q: '' });
    expect(filtroProductos(NaN, 'x'.repeat(80)).q).toHaveLength(60);
  });
});
