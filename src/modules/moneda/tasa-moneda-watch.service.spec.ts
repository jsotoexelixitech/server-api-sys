import { Logger } from '@nestjs/common';
import { TasaMonedaWatchService } from './tasa-moneda-watch.service';

describe('TasaMonedaWatchService', () => {
  const tasas = { findTasasIncompletas: jest.fn() };
  const monitor = { report: jest.fn() };
  const service = () => new TasaMonedaWatchService(tasas as never, monitor as never);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  it('con las tasas completas no reporta', async () => {
    tasas.findTasasIncompletas.mockResolvedValue([]);
    await service().runOnce();
    expect(monitor.report).not.toHaveBeenCalled();
  });

  it('EUR en NULL: incidente crítico que se agrupa y se cierra solo', async () => {
    tasas.findTasasIncompletas.mockResolvedValue([
      { cmoneda: 'EUR', tabla: 'mamonedas' },
      { cmoneda: 'EUR', tabla: 'mavamoneda' },
    ]);
    await service().runOnce();
    expect(monitor.report).toHaveBeenCalledWith(expect.objectContaining({
      type: 'moneda.tasa.incompleta',
      severity: 'critical',
      entity: 'EUR',
      dedupeKey: 'moneda:tasa-incompleta',
      autoResolveMinutes: 45,
    }));
    expect(monitor.report.mock.calls[0][0].message).toContain('EUR en mamonedas, EUR en mavamoneda');
  });

  it('si falla la consulta no lanza, y la siguiente ronda vuelve a revisar', async () => {
    const watch = service();
    tasas.findTasasIncompletas.mockRejectedValueOnce(new Error('sin conexión'));
    await expect(watch.runOnce()).resolves.toBeUndefined();
    tasas.findTasasIncompletas.mockResolvedValueOnce([]);
    await watch.runOnce();
    expect(tasas.findTasasIncompletas).toHaveBeenCalledTimes(2);
  });

  it('no solapa rondas', async () => {
    let liberar: (v: unknown[]) => void = () => undefined;
    tasas.findTasasIncompletas.mockReturnValue(new Promise((r) => { liberar = r; }));
    const watch = service();
    const primera = watch.runOnce();
    await watch.runOnce();
    liberar([]);
    await primera;
    expect(tasas.findTasasIncompletas).toHaveBeenCalledTimes(1);
  });
});
