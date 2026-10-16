import {
  mapEstatusCatalogRows,
  normalizeEstatusFiltro,
} from './polizas-estatus.util';

describe('normalizeEstatusFiltro', () => {
  it.each([
    ['1', 'NOTIFICADO'],
    ['2', 'PENDIENTE'],
    ['3', 'PAGADO'],
    ['4', 'ANULADO'],
    ['5', 'RECHAZADO'],
  ])('convierte el ID %s en %s (lo que compara estatus_poliza)', (id, texto) => {
    expect(normalizeEstatusFiltro(id)).toBe(texto);
  });

  it('acepta el ID como número y con espacios', () => {
    expect(normalizeEstatusFiltro(3)).toBe('PAGADO');
    expect(normalizeEstatusFiltro(' 4 ')).toBe('ANULADO');
  });

  it('pasa a mayúsculas y recorta el texto', () => {
    expect(normalizeEstatusFiltro('pagado')).toBe('PAGADO');
    expect(normalizeEstatusFiltro('  Pendiente ')).toBe('PENDIENTE');
    expect(normalizeEstatusFiltro('PAGADO')).toBe('PAGADO');
  });

  it('no altera "sin filtro"', () => {
    expect(normalizeEstatusFiltro(null)).toBeNull();
    expect(normalizeEstatusFiltro(undefined)).toBeUndefined();
    expect(normalizeEstatusFiltro('')).toBe('');
    expect(normalizeEstatusFiltro('   ')).toBe('   ');
  });

  it('un ID desconocido no se inventa: queda como texto en mayúsculas', () => {
    expect(normalizeEstatusFiltro('9')).toBe('9');
  });
});

describe('mapEstatusCatalogRows', () => {
  it('filas de sp_obtener_estatus (id + descripción): usa la descripción como valor', () => {
    expect(
      mapEstatusCatalogRows([
        { cestatus: '3', xdescripcion: 'PAGADO' },
        { cestatus: '2', xdescripcion: 'Pendiente' },
      ]),
    ).toEqual([
      { cvalor: 'PAGADO', xdescripcion: 'PAGADO' },
      { cvalor: 'PENDIENTE', xdescripcion: 'PENDIENTE' },
    ]);
  });

  it('filas de la tabla estatus (id, descripcion)', () => {
    expect(
      mapEstatusCatalogRows([{ cestatus: 1, xdescripcion: 'NOTIFICADO' }, { id: 4, descripcion: 'anulado' }]),
    ).toEqual([
      { cvalor: 'NOTIFICADO', xdescripcion: 'NOTIFICADO' },
      { cvalor: 'ANULADO', xdescripcion: 'ANULADO' },
    ]);
  });

  it('si solo hay un ID conocido lo resuelve; si es desconocido lo descarta', () => {
    expect(mapEstatusCatalogRows([{ cestatus: '3' }, { cestatus: '99' }])).toEqual([
      { cvalor: 'PAGADO', xdescripcion: 'PAGADO' },
    ]);
  });

  it('descarta filas vacías o inválidas y elimina duplicados', () => {
    expect(
      mapEstatusCatalogRows([
        null,
        'x',
        {},
        { xdescripcion: '  ' },
        { xdescripcion: 'PAGADO' },
        { xdescripcion: 'pagado' },
      ]),
    ).toEqual([{ cvalor: 'PAGADO', xdescripcion: 'PAGADO' }]);
  });

  it('entrada que no es lista → []', () => {
    expect(mapEstatusCatalogRows(undefined)).toEqual([]);
    expect(mapEstatusCatalogRows({})).toEqual([]);
  });
});
