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
