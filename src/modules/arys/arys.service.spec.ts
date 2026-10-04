import { ConfigService } from '@nestjs/config';
import { ArysHttpError } from './arys.client';
import { ArysService } from './arys.service';

function build(existingJob: Record<string, unknown> | null) {
  const client = {
    isEnabled: () => true,
    findEstadoByName: jest.fn().mockResolvedValue({ id_estado: 1 }),
    findCiudadByName: jest.fn().mockResolvedValue({ id_ciudad: 2 }),
    addPropietario: jest.fn().mockResolvedValue(900),
    resolveVehicleCatalogFromVinma: jest.fn().mockResolvedValue({}),
    addVehiculo: jest.fn().mockResolvedValue(800),
    getCoberturas: jest.fn().mockResolvedValue({ primaTotal: 10 }),
    registrarSubcripcion: jest.fn(),
  };
  const repository = {
    resolveEmissionTarget: jest.fn().mockResolvedValue({
      cid: 'c1', casegurado: 'a1', cpoliza: 'P1', cnpoliza: 'N1', xplaca: 'X1',
    }),
    getPropietaryByCid: jest.fn().mockResolvedValue({ xestado: 'E', xciudad: 'C' }),
    getVehiculoByTarget: jest.fn().mockResolvedValue({ xplaca: 'X1' }),
  };
  const job = { id: 'j1', cnpoliza: 'N1', attempts: 1, maxAttempts: 5, status: 'RETRYING' };
  const jobs = {
    get: jest.fn().mockResolvedValue(existingJob),
    begin: jest.fn().mockResolvedValue(job),
    saveProgress: jest.fn().mockResolvedValue(undefined),
    markSuccess: jest.fn().mockResolvedValue(undefined),
    markFailure: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: () => undefined } as unknown as ConfigService;
  const reporter = { report: jest.fn().mockResolvedValue(undefined) };
  const service = new ArysService(client as never, repository as never, config, jobs as never, reporter as never);
  return { service, client, jobs, job, repository, reporter };
}

jest.mock('./arys.mapper', () => ({
  buildPropietarioRequest: () => ({}),
  buildVehiculoRequest: () => ({ placa: 'X1' }),
}));

describe('ArysService respaldo de membresía', () => {
  it('guarda ids y registra el fallo en la etapa subscripcion', async () => {
    const { service, client, jobs, job } = build(null);
    client.registrarSubcripcion.mockRejectedValue(
      new ArysHttpError('HTTP 500', 500, { primaTotal: 10 }, 'boom'),
    );

    const result = await service.registerMembershipFromEmission({ cnpoliza: 'N1' });

    expect(result).toBeNull();
    expect(jobs.saveProgress).toHaveBeenCalledWith(job, { personaId: 900 });
    expect(jobs.saveProgress).toHaveBeenCalledWith(job, { vehiculoId: 800 });
    expect(jobs.markFailure).toHaveBeenCalledWith(job, 'subscripcion', expect.any(ArysHttpError));
  });

  it('el reintento reutiliza personaId/vehiculoId y no los vuelve a crear', async () => {
    const { service, client, jobs } = build({ status: 'FAILED', personaId: 900, vehiculoId: 800 });
    client.registrarSubcripcion.mockResolvedValue({ certificado: 'ABC' });

    const result = await service.registerMembershipFromEmission({ cnpoliza: 'N1' });

    expect(result?.vehiculoId).toBe(800);
    expect(client.addPropietario).not.toHaveBeenCalled();
    expect(client.addVehiculo).not.toHaveBeenCalled();
    expect(jobs.markSuccess).toHaveBeenCalled();
  });

  it('omite una póliza cuya membresía ya fue registrada', async () => {
    const { service, client } = build({ status: 'SUCCESS' });
    const result = await service.registerMembershipFromEmission({ cnpoliza: 'N1' });
    expect(result).toBeNull();
    expect(client.registrarSubcripcion).not.toHaveBeenCalled();
  });

  it('avisa al monitor si falla antes de existir el respaldo (póliza no encontrada)', async () => {
    const { service, repository, reporter, jobs } = build(null);
    repository.resolveEmissionTarget.mockRejectedValue(new Error('Póliza no encontrada en Sis2000'));

    const result = await service.registerMembershipFromEmission({ cnpoliza: 'N-NOEXISTE' });

    expect(result).toBeNull();
    expect(jobs.begin).not.toHaveBeenCalled();
    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'arys.membership.failed',
        entity: 'N-NOEXISTE',
        dedupeKey: 'arys-membership:N-NOEXISTE:failed',
        details: { stage: 'target', sinRespaldo: true },
      }),
    );
  });

  it('no duplica el aviso cuando el respaldo sí existe (lo reporta markFailure)', async () => {
    const { service, client, reporter } = build(null);
    client.registrarSubcripcion.mockRejectedValue(new Error('500'));
    await service.registerMembershipFromEmission({ cnpoliza: 'N1' });
    expect(reporter.report).not.toHaveBeenCalled();
  });
});
