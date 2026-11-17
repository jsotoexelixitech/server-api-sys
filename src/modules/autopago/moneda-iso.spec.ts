import { monedaIso } from './moneda-iso';

describe('monedaIso', () => {
  it('$ → USD', () => {
    expect(monedaIso('$')).toBe('USD');
  });

  it('EUR → EUR', () => {
    expect(monedaIso('EUR')).toBe('EUR');
  });

  it('null → USD', () => {
    expect(monedaIso(null)).toBe('USD');
  });

  it('alias de dólar y euro', () => {
    for (const v of ['US$', 'USD', 'DOL', 'D', '', '  $ ', undefined, 'usd']) {
      expect(monedaIso(v)).toBe('USD');
    }
    expect(monedaIso('€')).toBe('EUR');
    expect(monedaIso('eur')).toBe('EUR');
  });

  it('otros códigos en mayúsculas', () => {
    expect(monedaIso('bs')).toBe('BS');
    expect(monedaIso('VES')).toBe('VES');
  });
});
