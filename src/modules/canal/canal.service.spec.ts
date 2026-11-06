import { ForbiddenException } from '@nestjs/common';
import { CanalService } from './canal.service';

function build(assertApiKeyRegistered: jest.Mock) {
  const query = jest.fn().mockResolvedValue({ recordset: [] });
  const db = { request: () => ({ query }) };
  const service = new CanalService({} as never, db as never, { assertApiKeyRegistered } as never);
  return { service, query };
}

describe('CanalService.getActores', () => {
  it('rechaza una clave no registrada sin consultar la BD', async () => {
    const { service, query } = build(jest.fn().mockRejectedValue(new Error('no registrada')));
    await expect(service.getActores('valor-inventado')).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rechaza cuando no hay clave', async () => {
    const assertKey = jest.fn().mockRejectedValue(new Error('apikey requerida.'));
    const { service, query } = build(assertKey);
    await expect(service.getActores(undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertKey).toHaveBeenCalledWith('');
    expect(query).not.toHaveBeenCalled();
  });

  it('devuelve el catálogo con una clave registrada', async () => {
    const { service, query } = build(jest.fn().mockResolvedValue(undefined));
    await expect(service.getActores('nest_valida')).resolves.toEqual({ canales: [], gestores: [] });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
