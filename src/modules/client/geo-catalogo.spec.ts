import { buildCiudadesQuery, buildEstadosQuery, limpiarGeo } from './geo-catalogo';

describe('catálogo de ubicación', () => {
  it('estados: parametriza el país', () => {
    const { sql, params } = buildEstadosQuery();
    expect(params).toEqual([{ name: 'cpais', type: 'int', value: 58 }]);
    expect(sql).toContain('FROM maestados');
    expect(sql).not.toMatch(/58/);
  });

  it('ciudades: parametriza país y estado, y rechaza un estado inválido', () => {
    const { sql, params } = buildCiudadesQuery(24);
    expect(params).toEqual([{ name: 'cpais', type: 'int', value: 58 }, { name: 'cestado', type: 'int', value: 24 }]);
    expect(sql).toContain('FROM maciudades');
    for (const malo of [0, -1, 1.5, NaN]) expect(() => buildCiudadesQuery(malo)).toThrow(RangeError);
  });

  it('limpia texto, descarta el marcador "Todos" y códigos no válidos', () => {
    expect(limpiarGeo([
      { codigo: 0, nombre: 'Todos' }, { codigo: '24', nombre: ' Miranda ' }, { codigo: 5, nombre: 'TODAS' }, { codigo: 7, nombre: '' }, { codigo: 'x', nombre: 'Mala' },
    ])).toEqual([{ codigo: 24, nombre: 'Miranda' }]);
  });
});
