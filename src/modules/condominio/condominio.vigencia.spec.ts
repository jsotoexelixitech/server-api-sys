import { BadRequestException } from '@nestjs/common';
import { CondominioService } from './condominio.service';

/** Tasa del Core 0,5 %: la cotización de 100 de prima se calculó con 1 %. */
const servicio = () => {
  const svc = Object.create(CondominioService.prototype) as any;
  svc.db = { types: {}, request: jest.fn() };
  svc.getTarificadorTasas = jest.fn().mockResolvedValue({
    tasas: [{ ccober: '1', ctarifa: '1', pprima: 0.5, pcomision: 0 }],
  });
  svc.partesPorAntiguedad = jest.fn().mockResolvedValue(new Map());
  return svc;
};

const cotizacion = (extra: object = {}) => ({
  suma_asegurada: 10000,
  prima_total: 100,
  coberturas: [
    { ccober: '1', ctarifa: '1', suma_asegurada: 10000, prima_bruta: 100, descuento: 0, recargo: 0, prima: 100, pcomision: 0, comision: 0 },
  ],
  ...extra,
});

const dias = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
const validar = (cot: object) => servicio().validarCotizacionPreestablecida(16, cot, [], []);

describe('Vigencia de la cotización', () => {
  it('sin vigencia exige las tarifas actuales', async () => {
    await expect(validar(cotizacion())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vigente respeta el precio aunque la tarifa haya cambiado', async () => {
    await expect(validar(cotizacion({ vigencia: { cotizada_el: dias(-2), vence_el: dias(5) } }))).resolves.toBeUndefined();
  });

  it('vencida vuelve a exigir las tarifas actuales', async () => {
    await expect(validar(cotizacion({ vigencia: { cotizada_el: dias(-20), vence_el: dias(-5) } }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vigente sigue rechazando una prima que no cuadra', async () => {
    const cot = cotizacion({ prima_total: 90, vigencia: { cotizada_el: dias(-2), vence_el: dias(5) } });
    await expect(validar(cot)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vigente no acepta una cobertura que el Core no tiene', async () => {
    const cot = cotizacion({ vigencia: { cotizada_el: dias(-2), vence_el: dias(5) } }) as any;
    cot.coberturas[0].ccober = '99';
    await expect(validar(cot)).rejects.toBeInstanceOf(BadRequestException);
  });
});
