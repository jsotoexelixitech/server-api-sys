import { BadRequestException } from '@nestjs/common';
import { CondominioService } from './condominio.service';

/** Cobertura 1 con tasa 0,35 % (promedio) y rango de 0,20 % a 0,50 %. */
const servicio = (rango: object = { ptasa_min: 0.2, ptasa_max: 0.5 }) => {
  const svc = Object.create(CondominioService.prototype) as any;
  svc.db = { types: {}, request: jest.fn() };
  svc.getTarificadorTasas = jest.fn().mockResolvedValue({
    tasas: [{ ccober: '1', ctarifa: '1', pprima: 0.35, pcomision: 0, ...rango }],
  });
  svc.partesPorAntiguedad = jest.fn().mockResolvedValue(new Map());
  svc.descuentoPorSuma = jest.fn().mockResolvedValue(0);
  return svc;
};

const cotizacion = (prima: number, tasa?: number, extra: object = {}) => ({
  suma_asegurada: 10000,
  prima_total: prima,
  coberturas: [
    {
      ccober: '1',
      ctarifa: '1',
      suma_asegurada: 10000,
      prima_bruta: prima,
      descuento: 0,
      recargo: 0,
      prima,
      pcomision: 0,
      comision: 0,
      ...(tasa !== undefined ? { tasa } : {}),
    },
  ],
  ...extra,
});

const validar = (cot: object, svc = servicio()) => svc.validarCotizacionPreestablecida(38, cot, [], []);

describe('Rango de tasa por cobertura', () => {
  it('sin tasa elegida usa la tasa vigente (promedio)', async () => {
    await expect(validar(cotizacion(35))).resolves.toBeUndefined();
  });

  it('acepta una tasa dentro del rango', async () => {
    await expect(validar(cotizacion(20, 0.2))).resolves.toBeUndefined();
    await expect(validar(cotizacion(50, 0.5))).resolves.toBeUndefined();
  });

  it('rechaza una tasa fuera del rango', async () => {
    await expect(validar(cotizacion(10, 0.1))).rejects.toThrow(/fuera del rango/);
    await expect(validar(cotizacion(60, 0.6))).rejects.toThrow(/fuera del rango/);
  });

  it('rechaza una prima que no corresponde a la tasa elegida', async () => {
    await expect(validar(cotizacion(30, 0.2))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin rango ignora la tasa enviada y exige la vigente', async () => {
    const svc = servicio({});
    await expect(validar(cotizacion(20, 0.2), svc)).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar(cotizacion(35, 0.2), svc)).resolves.toBeUndefined();
  });

  it('una cotización vigente conserva su tasa aunque el rango cambie', async () => {
    const vigencia = { vigencia: { cotizada_el: new Date().toISOString(), vence_el: new Date(Date.now() + 86400000).toISOString() } };
    await expect(validar(cotizacion(60, 0.6, vigencia))).resolves.toBeUndefined();
  });
});
