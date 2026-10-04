import { EmissionsService } from './emissions.service';

/**
 * La emisión de automóvil debe disparar la membresía Arys SIEMPRE, sin depender de que el plan
 * incluya la cobertura Club Arys (antes: hasClubArysCoverage la filtraba y había que llamar aparte).
 */
describe('EmissionsService.scheduleArysMembershipRegistration', () => {
  function build() {
    const arysService = { registerMembershipForEmission: jest.fn().mockResolvedValue(null) };
    const hasClubArysCoverage = jest.fn().mockResolvedValue(false); // plan SIN cobertura 15
    const service = Object.create(EmissionsService.prototype) as Record<string, unknown>;
    Object.assign(service, {
      arysService,
      hasClubArysCoverage,
      logger: { warn: jest.fn(), log: jest.fn() },
    });
    return { service, arysService, hasClubArysCoverage };
  }

  const run = (service: Record<string, unknown>, cnpoliza: string, body: Record<string, unknown>) =>
    (service.scheduleArysMembershipRegistration as (c: string, b: Record<string, unknown>) => void).call(
      service,
      cnpoliza,
      body,
    );

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('registra la membresía aunque el plan NO tenga la cobertura Club Arys', async () => {
    const { service, arysService, hasClubArysCoverage } = build();

    run(service, '18-1-0000130000', { xplaca: 'ABC123', cplan: 'RCV-SIN-ARYS' });
    await jest.advanceTimersByTimeAsync(2000);

    expect(arysService.registerMembershipForEmission).toHaveBeenCalledWith({
      cnpoliza: '18-1-0000130000',
      xplaca: 'ABC123',
    });
    expect(hasClubArysCoverage).not.toHaveBeenCalled(); // ya no condiciona el registro
  });

  it('toma la placa de cualquiera de los alias (xplaca / placa)', async () => {
    const { service, arysService } = build();
    run(service, 'N2', { placa: 'XYZ789' });
    await jest.advanceTimersByTimeAsync(2000);
    expect(arysService.registerMembershipForEmission).toHaveBeenCalledWith({ cnpoliza: 'N2', xplaca: 'XYZ789' });
  });

  it('no bloquea la emisión: devuelve de inmediato y registra en segundo plano', async () => {
    const { service, arysService } = build();
    run(service, 'N3', { xplaca: 'A' });
    expect(arysService.registerMembershipForEmission).not.toHaveBeenCalled(); // aún en el margen de espera
    await jest.advanceTimersByTimeAsync(2000);
    expect(arysService.registerMembershipForEmission).toHaveBeenCalledTimes(1);
  });

  it('un error de Arys nunca se propaga a la emisión', async () => {
    const { service, arysService } = build();
    arysService.registerMembershipForEmission.mockRejectedValue(new Error('Arys caído'));
    run(service, 'N4', { xplaca: 'A' });
    await expect(jest.advanceTimersByTimeAsync(2000)).resolves.not.toThrow();
  });
});
