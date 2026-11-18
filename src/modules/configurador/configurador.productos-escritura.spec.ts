import {
  CAMPOS_POST_ALTA, avisosCodigoProducto, camposEnviados, validarCamposProducto, validarEdicionProducto,
} from './configurador.productos-escritura';

describe('validarEdicionProducto', () => {
  it('exige cramo y al menos un campo', () => {
    expect(validarEdicionProducto({ cramo: 28 }).join(' ')).toMatch(/No hay campos/);
    expect(validarEdicionProducto({ xform: 'F1' }).join(' ')).toMatch(/cramo es obligatorio/);
    expect(validarEdicionProducto({ cramo: 28, xform: 'F1', igestor: true, norden: 2 })).toEqual([]);
  });

  it('valida largos, tipos y obligatorios', () => {
    expect(validarEdicionProducto({ cramo: 28, xabreviatura: 'ABCDEF' }).join(' ')).toMatch(/xabreviatura admite hasta 5/);
    expect(validarEdicionProducto({ cramo: 28, xdescripcion_l: ' ' }).join(' ')).toMatch(/xdescripcion_l no puede quedar vacío/);
    expect(validarEdicionProducto({ cramo: 28, igestor: 'si' }).join(' ')).toMatch(/igestor debe ser true o false/);
    expect(validarEdicionProducto({ cramo: 28, norden: 1.5 }).join(' ')).toMatch(/norden debe ser un entero/);
    expect(validarEdicionProducto({ cramo: 28, xurl_presentacion: null })).toEqual([]);
  });
});

describe('camposEnviados', () => {
  it('solo los presentes; textos recortados; vacío → null', () => {
    expect(camposEnviados({ xform: ' F1 ', xdescripcion_c: '', igestor: false, norden: 3 })).toEqual([
      ['xdescripcion_c', null], ['igestor', false], ['xform', 'F1'], ['norden', 3],
    ]);
  });

  it('el alta solo agrega los campos posteriores a sp_CrearProducto', () => {
    const pares = camposEnviados({ xdescripcion_l: 'NOMBRE', igestor: true, xform: 'F' }, CAMPOS_POST_ALTA);
    expect(pares.map(([c]) => c)).toEqual(['igestor', 'xform']);
    expect(validarCamposProducto({ mmonto_inicial: 'x'.repeat(21) }, CAMPOS_POST_ALTA).join(' ')).toMatch(/20/);
  });
});

describe('avisosCodigoProducto', () => {
  it('avisa (no bloquea) si el código pasa de 6 caracteres', () => {
    expect(avisosCodigoProducto('PRB01')).toEqual([]);
    expect(avisosCodigoProducto('PRODUCTO7').join(' ')).toMatch(/9 caracteres/);
  });
});
