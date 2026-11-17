import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CanalEmisorService, parsePolizas } from './canal-emisor.service';

function build(assertApiKeyRegistered: jest.Mock, recordset: unknown[] = []) {
  const input = jest.fn();
  const query = jest.fn().mockResolvedValue({ recordset });
  const req = { input, query };
  input.mockReturnValue(req);
  const db = { request: () => req, types: { VarChar: (n: number) => `varchar(${n})` } };
  const service = new CanalEmisorService(db as never, { assertApiKeyRegistered } as never);
  return { service, query, input };
}

describe('CanalEmisorService.getEmisorPolizas', () => {
  it('rechaza una clave no registrada sin consultar la BD', async () => {
    const { service, query } = build(jest.fn().mockRejectedValue(new Error('no')));
    await expect(service.getEmisorPolizas('x', '1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('valida la lista de pólizas', () => {
    expect(parsePolizas(' A-1, B-2 ,A-1')).toEqual(['A-1', 'B-2']);
    expect(() => parsePolizas('')).toThrow(BadRequestException);
    expect(() => parsePolizas("1'; DROP TABLE x")).toThrow(BadRequestException);
    expect(() => parsePolizas(Array.from({ length: 101 }, (_, i) => `P${i}`).join(','))).toThrow(
      BadRequestException,
    );
  });

  it('una fila por póliza (la más reciente); 0 y vacíos llegan como null; parámetros, no texto', async () => {
    const { service, query, input } = build(jest.fn().mockResolvedValue(undefined), [
      { cnpoliza: 'A-1 ', cgestor: '749', ccanalalt: 27, xcanalalt: 'CANAL', cproductor: 0, xproductor: null },
      { cnpoliza: 'A-1', cgestor: '749', ccanalalt: 99, xcanalalt: 'VIEJA', cproductor: 1, xproductor: 'X' },
      { cnpoliza: 'B-2', cgestor: '80080-1219', ccanalalt: null, xcanalalt: null, cproductor: 80080, xproductor: 'P' },
    ]);
    await expect(service.getEmisorPolizas('nest_ok', 'A-1,B-2')).resolves.toEqual([
      { cnpoliza: 'A-1', ccanalalt: 27, xcanalalt: 'CANAL', cproductor: null, xproductor: null, cgestor: '749' },
      { cnpoliza: 'B-2', ccanalalt: null, xcanalalt: null, cproductor: 80080, xproductor: 'P', cgestor: '80080-1219' },
    ]);
    expect(input).toHaveBeenCalledWith('p0', 'varchar(30)', 'A-1');
    expect(String(query.mock.calls[0][0])).toContain('IN (@p0, @p1)');
    expect(String(query.mock.calls[0][0])).not.toContain('A-1');
  });
});
