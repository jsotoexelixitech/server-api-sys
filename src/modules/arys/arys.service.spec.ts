import { ConfigService } from '@nestjs/config';
import { ArysHttpError } from './arys.client';
import { ArysService } from './arys.service';

function build(existingJob: Record<string, unknown> | null, arysEmissionEnabled = true) {
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
  const membershipConfig = { get: jest.fn().mockResolvedValue({ arysEmissionEnabled }) };
  const service = new ArysService(
    client as never,
    repository as never,
    config,
    jobs as never,
    reporter as never,
    membershipConfig as never,
  );
  return { service, client, jobs, job, repository, reporter, membershipConfig };
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

  it('si falla al resolver la póliza, el respaldo ya existe: queda registrado y es reintentable', async () => {
    const { service, repository, reporter, jobs, job } = build(null);
    repository.resolveEmissionTarget.mockRejectedValue(new Error('Póliza no encontrada en Sis2000'));

    const result = await service.registerMembershipFromEmission({ cnpoliza: 'N-NOEXISTE' });

    expect(result).toBeNull();
    // el trabajo se abre ANTES de consultar Sis2000
    expect(jobs.begin).toHaveBeenCalledWith(expect.objectContaining({ cnpoliza: 'N-NOEXISTE' }));
    expect(jobs.markFailure).toHaveBeenCalledWith(job, 'target', expect.any(Error));
    expect(reporter.report).not.toHaveBeenCalled(); // lo reporta markFailure, no el aviso "sin respaldo"
  });

  it('avisa al monitor si falla sin poder abrir respaldo (solo se conocía la placa)', async () => {
    const { service, repository, reporter, jobs } = build(null);
    repository.resolveEmissionTarget.mockRejectedValue(new Error('Placa no encontrada en Sis2000'));

    const result = await service.registerMembershipFromEmission({ xplaca: 'ZZZ999' });

    expect(result).toBeNull();
    expect(jobs.begin).not.toHaveBeenCalled();
    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'arys.membership.failed',
        entity: 'ZZZ999',
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

  describe('registerMembershipForEmission (emisión de automóvil)', () => {
    it('registra la membresía sin importar la cobertura del plan', async () => {
      const { service, client } = build(null);
      client.registrarSubcripcion.mockResolvedValue({ certificado: 'ABC' });

      const result = await service.registerMembershipForEmission({ cnpoliza: 'N1', xplaca: 'X1' });

      expect(result?.cnpoliza).toBe('N1');
      expect(client.registrarSubcripcion).toHaveBeenCalledTimes(1);
    });

    it('no hace nada si arys_emission_enabled está apagado en BD', async () => {
      const { service, client, jobs } = build(null, false);

      const result = await service.registerMembershipForEmission({ cnpoliza: 'N1' });

      expect(result).toBeNull();
      expect(jobs.begin).not.toHaveBeenCalled();
      expect(client.addPropietario).not.toHaveBeenCalled();
    });
  });

  it('dos llamadas simultáneas para la misma póliza registran una sola vez (sin duplicar en Arys)', async () => {
    const { service, client } = build(null);
    client.registrarSubcripcion.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ certificado: 'ABC' }), 20)),
    );

    const [a, b] = await Promise.all([
      service.registerMembershipFromEmission({ cnpoliza: 'N1' }), // la automática de la emisión
      service.registerMembershipFromEmission({ cnpoliza: 'N1' }), // la llamada manual aparte
    ]);

    expect(client.addPropietario).toHaveBeenCalledTimes(1);
    expect(client.addVehiculo).toHaveBeenCalledTimes(1);
    expect(client.registrarSubcripcion).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('permite un nuevo registro cuando el anterior ya terminó (reintento posterior)', async () => {
    const { service, client } = build(null);
    client.registrarSubcripcion.mockRejectedValueOnce(new Error('500')).mockResolvedValue({ certificado: 'ABC' });

    expect(await service.registerMembershipFromEmission({ cnpoliza: 'N1' })).toBeNull(); // falla
    const retry = await service.registerMembershipFromEmission({ cnpoliza: 'N1' });
    expect(retry?.cnpoliza).toBe('N1');
  });
});
