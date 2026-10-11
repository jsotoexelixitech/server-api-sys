import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { agruparCausas, buildCausasQuery } from './causas-siniestro';
import { SearchCausasDto } from './dto/search-causas.dto';

describe('buildCausasQuery', () => {
  it('parametriza ramo y coberturas; nunca concatena valores en el SQL', () => {
    const { sql, params } = buildCausasQuery(18, [1, 2, 7]);
    expect(params).toEqual([
      { name: 'cramo', type: 'int', value: 18 },
      { name: 'c0', type: 'int', value: 1 },
      { name: 'c1', type: 'int', value: 2 },
      { name: 'c2', type: 'int', value: 7 },
    ]);
    expect(sql).toContain('IN (@c0, @c1, @c2)');
    expect(sql).toContain('TRY_CONVERT(int, cs.ccobertura)'); // CHAR con relleno
    expect(sql).not.toMatch(/\b18\b.*\b7\b/s);
  });

  it('rechaza ramos no admitidos y listas vacías o enormes', () => {
    expect(() => buildCausasQuery(5, [1])).toThrow(RangeError);
    expect(() => buildCausasQuery(18, [])).toThrow(RangeError);
    expect(() => buildCausasQuery(18, Array.from({ length: 51 }, (_, i) => i + 1))).toThrow(RangeError);
  });
});

describe('agruparCausas', () => {
  it('une las coberturas de una misma causa y recorta el texto', () => {
    const r = agruparCausas([
      { ccausa: 18126, xcausa: 'CHOQUE  ', ccobertura: 1 },
      { ccausa: 18126, xcausa: 'CHOQUE  ', ccobertura: 2 },
      { ccausa: 18126, xcausa: 'CHOQUE  ', ccobertura: 2 },
      { ccausa: 18012, xcausa: 'CAIDA', ccobertura: null },
    ]);
    expect(r).toEqual([
      { ccausa: 18126, xcausa: 'CHOQUE', ccoberturas: [1, 2] },
      { ccausa: 18012, xcausa: 'CAIDA', ccoberturas: [] },
    ]);
  });
});

describe('SearchCausasDto', () => {
  const crear = (cramo: unknown, ccoberturas: unknown) => plainToInstance(SearchCausasDto, { cramo, ccoberturas });

  it('acepta "1,2,7" y convierte a números', async () => {
    const dto = crear('18', '1, 2,7');
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ cramo: 18, ccoberturas: [1, 2, 7] });
  });

  it.each([['5', '1'], ['18', ''], ['18', 'a,b'], ['18', '0'], ['18', '1.5']])('rechaza ramo %p con coberturas %p', async (r, c) => {
    expect((await validate(crear(r, c))).length).toBeGreaterThan(0);
  });
});
