import { mapRowFromConfig } from './column-mapper';

const config = {
  columnMap: { origenClave: 'origen_clave', numeroPoliza: 'numero_poliza' },
  origenClave: { sep: '|', concat: ['numero_poliza', 'id_ramo', 'fecha_emision_poliza'] },
};

describe('column-mapper · origen_clave compuesta', () => {
  it('la fecha va como YYYY-MM-DD, no como texto local del proceso', () => {
    const mapped = mapRowFromConfig(
      'polizas',
      { numero_poliza: '5-0000000510-0', id_ramo: 5, fecha_emision_poliza: new Date('2026-01-05T00:00:00Z') },
      config,
    );
    expect(mapped.origenClave).toBe('5-0000000510-0|5|2026-01-05');
  });

  it('la misma fila da la misma clave aunque cambie la zona horaria', () => {
    const fila = { numero_poliza: 'X', id_ramo: 18, fecha_emision_poliza: new Date('2026-02-26T00:00:00Z') };
    const a = mapRowFromConfig('polizas', fila, config).origenClave;
    const b = mapRowFromConfig('polizas', { ...fila }, config).origenClave;
    expect(a).toBe('X|18|2026-02-26');
    expect(b).toBe(a);
    expect(String(a)).not.toContain('GMT');
  });

  it('las partes que no son fecha no cambian', () => {
    const mapped = mapRowFromConfig(
      'polizas',
      { numero_poliza: 'Y', id_ramo: 7, fecha_emision_poliza: '2026-03-01' },
      config,
    );
    expect(mapped.origenClave).toBe('Y|7|2026-03-01');
  });
});
