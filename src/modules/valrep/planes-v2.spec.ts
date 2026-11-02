import { BadRequestException } from '@nestjs/common';
import { ValrepService } from './valrep.service';
import { GetPlanesV2Dto } from './dto/get-planes-v2.dto';

describe('ValrepService.getPlanesV2 — sp_busca_plan_nexus y bexclusivos', () => {
  const base: GetPlanesV2Dto = {
    cramo: 18,
    ctipo: 1,
    cproductor: 1193,
    cusuario: '912',
    citem: '1193',
    centidad: 'P',
  };

  function build() {
    const inputs: Record<string, unknown> = {};
    const execute = jest.fn().mockResolvedValue({
      output: { mensaje: 'Planes encontrados' },
      recordset: [{ cramo: 18, cplan: 'RCVEXT' }],
    });
    const request = {
      input: jest.fn((name: string, _type: unknown, value: unknown) => {
        inputs[name] = value;
      }),
      output: jest.fn(),
      execute,
      query: jest.fn().mockResolvedValue({ recordset: [] }),
    };
    const db = {
      request: jest.fn(() => request),
      types: new Proxy({}, { get: () => () => 'T' }),
    };
    const mausuplanRepo = { getAssignedPlans: jest.fn().mockResolvedValue(new Set(['RCVEXT'])) };
    const service = new ValrepService(db as never, {} as never, mausuplanRepo as never, {} as never);
    return { service, inputs, execute };
  }

  afterEach(() => {
    delete process.env.MSSQL_SP_BUSCA_PLAN_NEXUS;
  });

  it('ejecuta sp_busca_plan_nexus y no envía @bexclusivos si no viene', async () => {
    const { service, inputs, execute } = build();
    await service.getPlanesV2(base);
    expect(execute).toHaveBeenCalledWith('sp_busca_plan_nexus');
    expect(inputs).not.toHaveProperty('bexclusivos');
  });

  it('con bexclusivos false tampoco envía el parámetro', async () => {
    const { service, inputs } = build();
    await service.getPlanesV2({ ...base, bexclusivos: false });
    expect(inputs).not.toHaveProperty('bexclusivos');
  });

  it('con bexclusivos true envía @bexclusivos = 1', async () => {
    const { service, inputs } = build();
    await service.getPlanesV2({ ...base, bexclusivos: true });
    expect(inputs.bexclusivos).toBe(true);
  });

  it('bexclusivos sin citem responde 400', async () => {
    const { service, execute } = build();
    await expect(
      service.getPlanesV2({ ...base, citem: undefined, bexclusivos: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('respeta el override MSSQL_SP_BUSCA_PLAN_NEXUS', async () => {
    process.env.MSSQL_SP_BUSCA_PLAN_NEXUS = 'spBuscaPlan';
    const { service, execute } = build();
    await service.getPlanesV2(base);
    expect(execute).toHaveBeenCalledWith('spBuscaPlan');
  });
});
