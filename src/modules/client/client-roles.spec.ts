import { InternalServerErrorException } from '@nestjs/common';
import { ClientService } from './client.service';

function crear(query: () => Promise<{ recordset: unknown[] }>) {
  const consultas: string[] = [];
  const db: any = {
    types: {},
    request: () => ({
      query: jest.fn(async (sql: string) => {
        consultas.push(sql);
        return query();
      }),
    }),
  };
  return { service: new ClientService(db), consultas };
}

describe('ClientService.listRoles', () => {
  it('devuelve los roles y consulta solo los activos, ordenados por departamento', async () => {
    const filas = [{ crol: 13, xrol: 'Director', cdepartamento: 11, xdepartamento: 'Canales Alternos' }];
    const { service, consultas } = crear(async () => ({ recordset: filas }));

    await expect(service.listRoles()).resolves.toEqual(filas);

    expect(consultas[0]).toContain("RTRIM(r.istatus) = 'V'");
    expect(consultas[0]).toContain('ORDER BY d.xdepartamento');
    expect(consultas[0]).toContain('FROM serol');
  });

  it('sin filas devuelve lista vacía', async () => {
    const { service } = crear(async () => ({ recordset: [] }));
    await expect(service.listRoles()).resolves.toEqual([]);
  });

  it('un error de BD responde 500 sin filtrar detalles', async () => {
    const { service } = crear(async () => {
      throw new Error('Login failed for user sa');
    });
    const err = await service.listRoles().catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect(JSON.stringify(err.getResponse())).not.toContain('Login failed');
  });
});
