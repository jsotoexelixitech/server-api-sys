import { cpolizaTexto } from './cpoliza';

describe('cpolizaTexto', () => {
  it('conserva los 19 dígitos que llegan como texto desde SQL', () => {
    expect(cpolizaTexto('1800000000000234032')).toBe('1800000000000234032');
    expect(cpolizaTexto(' 1800000000000234032 ')).toBe('1800000000000234032');
    expect(cpolizaTexto('1800000000000234032.0')).toBe('1800000000000234032');
  });

  it('no acepta un number que ya se redondeó (pasa de 2^53)', () => {
    expect(cpolizaTexto(1800000000000234032)).toBeUndefined();
  });

  it('acepta number seguro y bigint', () => {
    expect(cpolizaTexto(1800000123)).toBe('1800000123');
    expect(cpolizaTexto(1800000000000234032n)).toBe('1800000000000234032');
  });

  it('vacío, cero, negativo o no numérico → undefined', () => {
    for (const v of [null, undefined, '', '   ', 0, '0', '000', -5, '-5', 'abc', '12a', '18000000000002340321']) {
      expect(cpolizaTexto(v)).toBeUndefined();
    }
  });

  it('quita ceros a la izquierda', () => {
    expect(cpolizaTexto('00123')).toBe('123');
  });
});
