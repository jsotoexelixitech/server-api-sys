import { BadRequestException } from '@nestjs/common';
import { PersonasService } from './personas.service';

/**
 * R-095117: VIAJE5 (3.000 $) y VIAJE6 (5.000 $) del ramo 25 cobran la prima ANUAL del plan
 * (spCalculoPer) ÷ 365 × días del viaje, máximo 10. VIAJE (ramo 25) y los VIAJ* del ramo 5
 * siguen con spCalculoViajeroProrrata.
 */
describe('PersonasService.getCotizacionPer — Viajero Local por días', () => {
  const type = () => 'T';
  const types = {
    Int: 'Int', Float: 'Float', Date: 'Date', Bit: 'Bit',
    VarChar: type, NVarChar: type, Char: type, Numeric: type,
  };

  function buildService(anual: { mprimaext: number; tasa: number; split?: number[] }) {
    const executed: { sp: string; inputs: Record<string, unknown> }[] = [];
    const db = {
      types,
      request: () => {
        const inputs: Record<string, unknown> = {};
        return {
          input: (name: string, _t: unknown, value: unknown) => {
            inputs[name] = value;
          },
          output: () => undefined,
          execute: async (sp: string) => {
            executed.push({ sp, inputs });
            if (sp === 'spCalculoPer') {
              return {
                recordsets: [
                  (anual.split ?? [1, 0]).map((f, i) => ({
                    ccobertura: 38 + i, xcobertura: `Cobertura ${38 + i}`, msumaasegext: 3000,
                    mprimaext: anual.mprimaext * f, mprima: anual.mprimaext * f * anual.tasa,
                  })),
                  [{ cparen: 1, mprimaext: anual.mprimaext, mprima: anual.mprimaext * anual.tasa }],
                ],
              };
            }
            // spCalculoViajeroProrrata (VIAJE / ramo 5): 0,75 por día.
            return { output: { berror: false, mprimaext: 3.75, mprima: 3427.58, ndias: 5 } };
          },
          query: async () => ({ recordset: [] }),
        };
      },
    };
    const config = { get: (_k: string, def?: unknown) => def };
    const service = new PersonasService(db as never, config as never, {} as never);
    return { service, executed };
  }

  const titular = [{ cparen: 1, xrif_asegurado: '12345678', nedad_asegurado: 40 }];

  it('VIAJE5: prima anual de spCalculoPer (frecuencia A) × días / 365', async () => {
    const { service, executed } = buildService({ mprimaext: 120, tasa: 914.02 });
    const r = await service.getCotizacionPer({
      cramo: 25, cplan: 'VIAJE5', ifrecuencia: 'E',
      fdesde: '2026-11-20', fhasta: '2026-11-24', asegurados: titular,
    } as never);

    expect(executed.map((e) => e.sp)).toEqual(['spCalculoPer']);
    expect(executed[0].inputs['ifrecuencia']).toBe('A');
    expect(executed[0].inputs['msumaaseg']).toBeNull();
    // 120 × 5 / 365 = 1,6438 → 1,64 USD; Bs con la misma tasa.
    expect(r.mprimaext).toBe(1.64);
    expect(r.mprima).toBe(1498.99);
    expect(r.ndias).toBe(5);
    expect(r.mprimaextAnual).toBe(120);
    expect(r.coberturas.map((c) => c.mprimaext)).toEqual([1.64, 0]);
  });

  it('prima repartida en coberturas: se prorratea cada una y se suma, como el recibo', async () => {
    const { service } = buildService({ mprimaext: 120, tasa: 914.02, split: [0.6, 0.4] });
    const r = await service.getCotizacionPer({
      cramo: 25, cplan: 'VIAJE5', ifrecuencia: 'E',
      fdesde: '2026-11-20', fhasta: '2026-11-24', asegurados: titular,
    } as never);
    // 72 × 5 / 365 = 0,99 y 48 × 5 / 365 = 0,66 → 1,65 USD; Bs: 904,88 + 603,25.
    expect(r.coberturas.map((c) => c.mprimaext)).toEqual([0.99, 0.66]);
    expect(r.mprimaext).toBe(1.65);
    expect(r.mprima).toBe(1508.13);
  });

  it('VIAJE6 con 3 días (mínimo) y por ndias sin fechas', async () => {
    const { service } = buildService({ mprimaext: 200, tasa: 1 });
    const r = await service.getCotizacionPer({
      cramo: 25, cplan: 'VIAJE6', ifrecuencia: 'E', ndias: 3, asegurados: titular,
    } as never);
    expect(r.mprimaext).toBe(1.64);
  });

  it('VIAJE5 con 11 días → 400 «máximo 10 días» sin llamar al SP', async () => {
    const { service, executed } = buildService({ mprimaext: 120, tasa: 1 });
    await expect(
      service.getCotizacionPer({
        cramo: 25, cplan: 'VIAJE5', ifrecuencia: 'E',
        fdesde: '2026-11-20', fhasta: '2026-11-30', asegurados: titular,
      } as never),
    ).rejects.toThrow(new BadRequestException('Viajero Local por días: máximo 10 días.'));
    expect(executed).toHaveLength(0);
  });

  it('VIAJE (ramo 25) sigue con spCalculoViajeroProrrata', async () => {
    const { service, executed } = buildService({ mprimaext: 120, tasa: 1 });
    const r = await service.getCotizacionPer({
      cramo: 25, cplan: 'VIAJE', ifrecuencia: 'E',
      fdesde: '2026-11-20', fhasta: '2026-11-24', asegurados: titular,
    } as never);
    expect(executed.map((e) => e.sp)).toEqual(['spCalculoViajeroProrrata']);
    expect(r.mprimaext).toBe(3.75);
    expect(r.ndias).toBeUndefined();
  });

  it('VIAJE5 del ramo 5 (4 días, 1.500 $) sigue con spCalculoViajeroProrrata', async () => {
    const { service, executed } = buildService({ mprimaext: 120, tasa: 1 });
    await service.getCotizacionPer({
      cramo: 5, cplan: 'VIAJE5', ifrecuencia: 'E',
      fdesde: '2026-11-20', fhasta: '2026-11-23', asegurados: titular,
    } as never);
    expect(executed.map((e) => e.sp)).toEqual(['spCalculoViajeroProrrata']);
  });
});
