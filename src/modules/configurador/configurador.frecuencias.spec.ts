import {
  descripcionAlta, elegirFilaFrecuencia, ndiasLlave, normalizarLetra, validarAltaFrecuencia, validarAltaFrecuenciaProductor,
  validarEdicionFrecuencia,
} from './configurador.frecuencias';

describe('validarAltaFrecuencia', () => {
  it('acepta las letras válidas en minúscula o mayúscula', () => {
    for (const l of ['A', 's', 'T', 'c', 'M', 'E', 'K']) expect(validarAltaFrecuencia({ ifrecuencia: l })).toEqual([]);
    expect(normalizarLetra(' m ')).toBe('M');
  });

  it('rechaza letras desconocidas', () => {
    expect(validarAltaFrecuencia({ ifrecuencia: 'X' }).join(' ')).toMatch(/A\/S\/T\/C\/M\/E\/K\/D/);
    expect(validarAltaFrecuencia({ ifrecuencia: '' }).join(' ')).toMatch(/ifrecuencia/);
  });

  it('D exige ndias distinto de 0 (admite negativos: -30 = más de 30 días)', () => {
    expect(validarAltaFrecuencia({ ifrecuencia: 'D' }).join(' ')).toMatch(/ndias es obligatorio/);
    expect(validarAltaFrecuencia({ ifrecuencia: 'D', ndias: 0 }).join(' ')).toMatch(/ndias es obligatorio/);
    expect(validarAltaFrecuencia({ ifrecuencia: 'D', ndias: 7 })).toEqual([]);
    expect(validarAltaFrecuencia({ ifrecuencia: 'D', ndias: -30 })).toEqual([]);
  });

  it('A y E pueden llevar ndias (datos reales: A 365, E 3-8)', () => {
    expect(validarAltaFrecuencia({ ifrecuencia: 'A', ndias: 365 })).toEqual([]);
    expect(validarAltaFrecuencia({ ifrecuencia: 'E', ndias: 3 })).toEqual([]);
    expect(validarAltaFrecuencia({ ifrecuencia: 'A', ndias: 1.5 }).join(' ')).toMatch(/entero/);
  });

  it('descripción por defecto y largo máximo', () => {
    expect(descripcionAlta({ ifrecuencia: 'm' })).toBe('MENSUAL');
    expect(descripcionAlta({ ifrecuencia: 'D', ndias: 7 })).toBe('Hasta 7 días');
    expect(descripcionAlta({ ifrecuencia: 'D', ndias: -30 })).toBe('Más de 30 días');
    expect(descripcionAlta({ ifrecuencia: 'A', xfrecuencia: ' 12 meses ' })).toBe('12 meses');
    expect(validarAltaFrecuencia({ ifrecuencia: 'A', xfrecuencia: 'x'.repeat(151) }).join(' ')).toMatch(/150/);
    expect(validarAltaFrecuencia({ ifrecuencia: 'A', itipo: 'DD' }).join(' ')).toMatch(/itipo/);
  });

  it('frecuencia de productor exige cproductor positivo', () => {
    expect(validarAltaFrecuenciaProductor({ ifrecuencia: 'S', cproductor: 628 })).toEqual([]);
    expect(validarAltaFrecuenciaProductor({ ifrecuencia: 'S', cproductor: 0 }).join(' ')).toMatch(/cproductor/);
  });
});

describe('validarEdicionFrecuencia', () => {
  it('exige al menos un campo y valida iestado', () => {
    expect(validarEdicionFrecuencia({ ndias: 7 }, 'D').join(' ')).toMatch(/No hay campos/);
    expect(validarEdicionFrecuencia({ iestado: 'X' }, 'M').join(' ')).toMatch(/'V' o 'I'/);
    expect(validarEdicionFrecuencia({ iestado: 'I' }, 'M')).toEqual([]);
    expect(validarEdicionFrecuencia({ xfrecuencia: '  ' }, 'M').join(' ')).toMatch(/vacía/);
  });

  it('D no puede quedar sin ndias', () => {
    expect(validarEdicionFrecuencia({ ndiasNuevo: null }, 'D').join(' ')).toMatch(/D necesita ndias/);
    expect(validarEdicionFrecuencia({ ndiasNuevo: 15 }, 'D')).toEqual([]);
    expect(validarEdicionFrecuencia({ ndiasNuevo: null }, 'A')).toEqual([]);
  });
});

describe('elegirFilaFrecuencia', () => {
  const filas = [
    { ifrecuencia: 'D', ndias: 3, iestado: 'V' },
    { ifrecuencia: 'D', ndias: 7, iestado: 'V' },
    { ifrecuencia: 'M', ndias: null, iestado: 'V' },
    { ifrecuencia: 'M', ndias: 0, iestado: 'I' },
    { ifrecuencia: 'S', ndias: 0, iestado: 'N' },
    { ifrecuencia: 'A', ndias: 0, iestado: 'V' },
    { ifrecuencia: 'A', ndias: null, iestado: 'V' },
  ];

  it('NULL y 0 son la misma llave', () => {
    expect(ndiasLlave(null)).toBe(0);
    expect(elegirFilaFrecuencia(filas, 'm', undefined)).toEqual({ ndias: 0 });
  });

  it('pide ndias si la letra tiene varias filas', () => {
    expect(elegirFilaFrecuencia(filas, 'D', undefined)).toMatchObject({ conflicto: true });
    expect(elegirFilaFrecuencia(filas, 'D', 7)).toEqual({ ndias: 7 });
  });

  it('404 si no está; 409 si solo hay N/A o dos V con la misma llave', () => {
    expect(elegirFilaFrecuencia(filas, 'T', undefined)).toMatchObject({ conflicto: false });
    expect(elegirFilaFrecuencia(filas, 'D', 15)).toMatchObject({ conflicto: false });
    expect(elegirFilaFrecuencia(filas, 'S', undefined)).toMatchObject({ conflicto: true });
    expect(elegirFilaFrecuencia(filas, 'A', undefined)).toMatchObject({ conflicto: true });
  });
});
