import { dedupeCities } from './ciudades';

describe('ciudades por estado (valrep/cities)', () => {
  it('deja una sola fila por cciudad (el combo del Formulario resuelve la etiqueta por código)', () => {
    const rows = [
      { cciudad: 401, xdescripcion_l: 'Maracay' },
      { cciudad: 410, xdescripcion_l: 'Santa Cruz' },
      { cciudad: 410, xdescripcion_l: 'Santa Cruz de Aragua' },
    ];
    const out = dedupeCities(rows);
    expect(out.map((r) => r.cciudad)).toEqual([401, 410]);
    expect(out[1].xdescripcion_l).toBe('Santa Cruz');
  });

  it('descarta códigos no numéricos y conserva el orden', () => {
    const out = dedupeCities([
      { cciudad: NaN, xdescripcion_l: 'X' },
      { cciudad: 2, xdescripcion_l: 'B' },
      { cciudad: 1, xdescripcion_l: 'A' },
    ]);
    expect(out.map((r) => r.xdescripcion_l)).toEqual(['B', 'A']);
  });
});
