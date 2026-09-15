import { flattenMarketplaceCanal } from './viajero-canal.mapper';

describe('flattenMarketplaceCanal', () => {
  it('aplana canal anidado', () => {
    const out = flattenMarketplaceCanal({
      canal: {
        cproductor: 80080,
        ctipocanal: 'A',
        ccanalalt: 24,
        cscanalalt: 2,
        cusuario: 7,
      },
    });
    expect(out.productor).toBe(80080);
    expect(out.ctipocanal).toBe('A');
    expect(out.ccanalalt).toBe(24);
    expect(out.cscanalalt).toBe(2);
    expect(out.cusuario).toBe(7);
  });

  it('acepta gestor al estilo SysIP', () => {
    const out = flattenMarketplaceCanal({
      productor: 80080,
      gestor: { ccanalalt: 24, cscanalalt: 2, cgestor: 'ABC-1' },
    });
    expect(out.productor).toBe(80080);
    expect(out.ccanalalt).toBe(24);
    expect(out.cscanalalt).toBe(2);
    expect(out.cgestor).toBe('ABC-1');
  });

  it('centidad P usa citem como productor', () => {
    const out = flattenMarketplaceCanal({ centidad: 'P', citem: '12345' });
    expect(out.productor).toBe(12345);
    expect(out.cproductor).toBe(12345);
    expect(out.ccanalalt).toBeUndefined();
  });

  it('centidad C usa citem/csub y productor 80080', () => {
    const out = flattenMarketplaceCanal({
      centidad: 'C',
      citem: '24',
      csub: '2',
      ctipocanal: 'A',
    });
    expect(out.productor).toBe(80080);
    expect(out.ccanalalt).toBe(24);
    expect(out.cscanalalt).toBe(2);
    expect(out.ctipocanal).toBe('A');
  });

  it('productor explícito gana a centidad P', () => {
    const out = flattenMarketplaceCanal({
      centidad: 'P',
      citem: '12345',
      productor: 80080,
    });
    expect(out.productor).toBe(80080);
  });

  it('centidad G usa citem como cgestor', () => {
    const out = flattenMarketplaceCanal({ centidad: 'G', citem: 'gestor-9' });
    expect(out.cgestor).toBe('gestor-9');
  });
});
