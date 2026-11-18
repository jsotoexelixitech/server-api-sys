import { PersonasService } from './personas.service';

/**
 * Producto 76 (canal Farmatodo C/8): el SP devuelve plan "1" en ramo 1 (Vida Individual)
 * y plan "1" en ramo 47 (Masivo Vida Temporal). Ambos deben llegar al front.
 */
describe('PersonasService.getPlanesPer — mismo cplan en distintos ramos', () => {
  function buildService() {
    const nmaxPorRamo: Record<number, { cplan: string; nmax_dep: number | null }[]> = {
      1: [{ cplan: '1', nmax_dep: 3 }, { cplan: 'VIDCAN', nmax_dep: null }],
      47: [{ cplan: '1', nmax_dep: 0 }],
    };
    const db = {
      types: { Int: 'Int', NVarChar: () => 'NVarChar' },
      request: () => {
        const inputs: Record<string, unknown> = {};
        return {
          input: (name: string, _t: unknown, value: unknown) => {
            inputs[name] = value;
          },
          query: async () => ({ recordset: nmaxPorRamo[Number(inputs['cramo'])] ?? [] }),
        };
      },
    };
    const config = { get: (_k: string, def?: string) => def };
    const valrep = {
      getPlanesProducto: jest.fn().mockResolvedValue({
        planes: [
          { cplan: '1', cramo: 1, xplan: '1.000$ Vida' },
          { cplan: 'VIDCAN', cramo: 1, xplan: 'Vida Canal' },
          { cplan: '1', cramo: 47, xplan: 'Plan 6.000$ Masivo Vida Temporal' },
        ],
        mensaje: '',
      }),
    };
    return new PersonasService(db as never, config as never, valrep as never);
  }

  it('devuelve 1/1 y 47/1 sin descartar el segundo, cada uno con su nmax_dep', async () => {
    const planes = await buildService().getPlanesPer({
      cproducto: '76',
      centidad: 'C',
      citem: '8',
      cramo: 47,
    } as never);

    expect(planes.map((p) => `${p.cramo}|${p.cplan}`)).toEqual(['1|1', '1|VIDCAN', '47|1']);
    expect(planes.find((p) => p.cramo === 1 && p.cplan === '1')?.nmax_dep).toBe(3);
    expect(planes.find((p) => p.cramo === 47 && p.cplan === '1')?.nmax_dep).toBe(0);
  });
});

describe('PersonasService.getPlanesPer — viajero por días', () => {
  function buildService() {
    const porTabla: Record<string, Record<number, Record<string, unknown>[]>> = {
      maplanes_per: {
        5: [{ cplan: 'VIAJE4', nmax_dep: 5 }, { cplan: 'VIAJ10', nmax_dep: 6 }],
        25: [{ cplan: 'VIAJE5', nmax_dep: 6 }, { cplan: 'VIAJE1', nmax_dep: 5 }],
      },
      maplanes_frec: {
        5: [{ cplan: 'VIAJE4', ifrecuencia: 'E', ndias: 3 }, { cplan: 'VIAJ10', ifrecuencia: 'E', ndias: 0 }],
        25: [{ cplan: 'VIAJE1', ifrecuencia: 'E', ndias: 0 }],
      },
    };
    const db = {
      types: { Int: 'Int', NVarChar: () => 'NVarChar' },
      request: () => {
        const inputs: Record<string, unknown> = {};
        return {
          input: (name: string, _t: unknown, value: unknown) => {
            inputs[name] = value;
          },
          query: async (sql: string) => {
            const tabla = sql.includes('maplanes_frec') ? 'maplanes_frec' : 'maplanes_per';
            return { recordset: porTabla[tabla][Number(inputs['cramo'])] ?? [] };
          },
        };
      },
    };
    const config = { get: (_k: string, def?: string) => def };
    const valrep = {
      getPlanesProducto: jest.fn().mockResolvedValue({
        planes: [
          { cplan: 'VIAJE4', cramo: 5, xplan: 'Plan II 1.500$ Viajero por 3 días' },
          { cplan: 'VIAJ10', cramo: 5, xplan: 'Plan II 1.500$ Viajero por 15 días' },
          { cplan: 'VIAJE5', cramo: 25, xplan: 'Plan 3.000$ Viajero Local por Días' },
          { cplan: 'VIAJE1', cramo: 25, xplan: 'Plan I 1.500$ Viajero Local' },
        ],
        mensaje: '',
      }),
    };
    return new PersonasService(db as never, config as never, valrep as never);
  }

  it('informa los días de cada plan y deja solo al titular en los planes prorrata', async () => {
    const planes = await buildService().getPlanesPer({ cproducto: '26', centidad: 'C', citem: '1' } as never);
    const de = (ramo: number, cplan: string) => planes.find((p) => p.cramo === ramo && p.cplan === cplan);

    expect(de(5, 'VIAJE4')).toMatchObject({ ndias: 3, nmax_dep: 0, maxAsegurados: 1 });
    expect(de(5, 'VIAJ10')?.ndias).toBeUndefined();
    expect(de(5, 'VIAJ10')).toMatchObject({ nmax_dep: 0, maxAsegurados: 1 });
    expect(de(25, 'VIAJE5')).toMatchObject({ ndiasMin: 1, ndiasMax: 10, nmax_dep: 0, maxAsegurados: 1 });
    // VIAJE1 del ramo 25 no es prorrata ni tiene días: se queda como está.
    expect(de(25, 'VIAJE1')).toMatchObject({ nmax_dep: 5, maxAsegurados: 6 });
    expect(de(25, 'VIAJE1')?.ndias).toBeUndefined();
  });
});
