import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchCoveragesDto } from './dto/search-coverages.dto';

const crear = (cpoliza: unknown) => plainToInstance(SearchCoveragesDto, { cpoliza, fanopol: 2026, fmespol: 3 });

describe('SearchCoveragesDto (EXE-63)', () => {
  it('acepta pólizas de 19 dígitos sin perder precisión', async () => {
    const dto = crear('5000000000009806123');
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.cpoliza).toBe('5000000000009806123');
  });

  it('acepta pólizas de 15 dígitos', async () => {
    expect(await validate(crear('900000000065412'))).toHaveLength(0);
  });

  it.each(['12345678901234567890', 'abc', '', '12.5'])('rechaza %p', async (v) => {
    expect((await validate(crear(v))).length).toBeGreaterThan(0);
  });
});
