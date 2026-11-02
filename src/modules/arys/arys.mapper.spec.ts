import { buildVehiculoRequest } from './arys.mapper';
import { ArysDataError } from './arys.utils';

describe('buildVehiculoRequest', () => {
  const vehiculo = { cano: 2017, xplaca: 'AB123CD', xmarca: 'JEEP', xmodelo: 'GRAND CHEROKEE', xversion: 'LIMITED 4X4', xcolor: 'NEGRO' };
  const catalog = (idVersion: number, extra: Record<string, unknown> = {}) => ({
    marca: { id_marca: 38 },
    modelo: { id_modelo: 6 },
    version: { id_version: idVersion, version1: 'LIMITED 4X4', id_tipo_vehi: 2, capcarga: 522 },
    color: { id_color: 5 },
    versionPor: 'etiqueta' as const,
    ...extra,
  });

  it('acepta id_version 0 (Arys numera las versiones desde 0)', () => {
    const body = buildVehiculoRequest(vehiculo, catalog(0), 99);
    expect(body).toMatchObject({ id_propietario: 99, id_marca: 38, id_modelo: 6, id_version: 0, id_color: 5, id_tipo_vehi: 2, capacidad: 522 });
  });

  it('rechaza los demás ids en 0 y adjunta lo que se intentó enviar', () => {
    let error: unknown;
    try {
      buildVehiculoRequest(vehiculo, catalog(0, { color: { id_color: 0 } }), 99);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ArysDataError);
    expect((error as ArysDataError).message).toContain('color=0');
    expect((error as ArysDataError).requestBody).toMatchObject({
      id_marca: 38,
      id_version: 0,
      id_color: 0,
      _sis2000: { xversion: 'LIMITED 4X4', xcolor: 'NEGRO' },
      _version_arys: 'LIMITED 4X4',
      _version_por: 'etiqueta',
    });
  });

  it('rechaza id_version ausente', () => {
    expect(() =>
      buildVehiculoRequest(vehiculo, catalog(0, { version: { version1: 'X', id_tipo_vehi: 2 } }), 99),
    ).toThrow(ArysDataError);
  });
});
