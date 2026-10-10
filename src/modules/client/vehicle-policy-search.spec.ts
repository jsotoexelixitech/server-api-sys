import { BadRequestException } from '@nestjs/common';
import { ClientService } from './client.service';
import {
  LIMIT_DEFAULT,
  LIMIT_MAX,
  buildCoberturasQuery,
  buildVehiclePolicyQuery,
  escaparLike,
  normalizarPlaca,
  validarCriterios,
} from './vehicle-policy-search';

describe('vehicle-policy-search', () => {
  describe('criterios mínimos', () => {
    it('acepta placa sola, cédula sola, y marca con productor', () => {
      expect(validarCriterios({ placa: 'AB385WR' })).toBeNull();
      expect(validarCriterios({ cci_rif: 12345678 })).toBeNull();
      expect(validarCriterios({ marca: 'TOYOTA', cproductor: 80080 })).toBeNull();
    });

    it('rechaza consulta vacía y marca sola', () => {
      expect(validarCriterios({})).not.toBeNull();
      expect(validarCriterios({ marca: 'TOYOTA' })).not.toBeNull();
      expect(validarCriterios({ cproductor: 80080 })).not.toBeNull();
    });

    it('rechaza placas fuera de rango tras normalizar', () => {
      expect(validarCriterios({ placa: "X'; DROP TABLE adpoliza;--" })).not.toBeNull();
      expect(validarCriterios({ placa: 'A-' })).not.toBeNull();
    });

    it('buildVehiclePolicyQuery lanza si faltan criterios', () => {
      expect(() => buildVehiclePolicyQuery({ marca: 'TOYOTA' })).toThrow(RangeError);
    });
  });

  describe('seguridad del SQL', () => {
    it('los valores del usuario nunca aparecen en el texto SQL', () => {
      const inyeccion = "X'; DROP TABLE adpoliza;--";
      const { sql, params } = buildVehiclePolicyQuery({ placa: 'AB385WR', marca: inyeccion, cproductor: 1 });

      expect(sql).not.toContain('DROP');
      expect(sql).not.toContain(inyeccion);
      expect(params.find((p) => p.name === 'marca')?.value).toContain('DROP'); // viaja como parámetro
    });

    it('limita el ramo a automóvil y RCV', () => {
      const { sql } = buildVehiclePolicyQuery({ placa: 'AB385WR' });
      expect(sql).toContain('p.cramo IN (18,26)');
    });

    it('no existe ruta que omita el filtro (sin fallback a "todas")', () => {
      const { sql } = buildVehiclePolicyQuery({ cci_rif: 1 });
      expect(sql).toContain('WHERE');
      expect(sql).toMatch(/v\.casegurado = @cci_rif/);
    });

    it('escapa comodines LIKE en la marca', () => {
      expect(escaparLike('100%_[x]\\')).toBe('100\\%\\_\\[x]\\\\');
      const { params } = buildVehiclePolicyQuery({ marca: 'A%', cproductor: 1 });
      expect(params.find((p) => p.name === 'marca')?.value).toBe('A\\%%');
    });
  });

  describe('normalización y paginación', () => {
    it('normaliza la placa', () => {
      expect(normalizarPlaca(' ab-385 wr ')).toBe('AB385WR');
      const { params } = buildVehiclePolicyQuery({ placa: 'ab-385 wr' });
      expect(params.find((p) => p.name === 'placa')?.value).toBe('AB385WR');
    });

    it('aplica límite por defecto y tope', () => {
      expect(buildVehiclePolicyQuery({ placa: 'AB385WR' }).limit).toBe(LIMIT_DEFAULT);
      expect(buildVehiclePolicyQuery({ placa: 'AB385WR', limit: 9999 }).limit).toBe(LIMIT_MAX);
      expect(buildVehiclePolicyQuery({ placa: 'AB385WR', limit: 0 }).limit).toBe(1);
    });

    it('pide una fila extra para detectar la página siguiente', () => {
      const { params } = buildVehiclePolicyQuery({ placa: 'AB385WR', limit: 10, offset: 20 });
      expect(params.find((p) => p.name === 'fetch')?.value).toBe(11);
      expect(params.find((p) => p.name === 'offset')?.value).toBe(20);
    });
  });

  describe('coberturas por plan', () => {
    it('parametriza cada plan', () => {
      const { sql, params } = buildCoberturasQuery([
        { cramo: 18, cplan: 'RCVBAS' },
        { cramo: 18, cplan: 'AMPLIA1' },
      ]);
      expect(params).toHaveLength(4);
      expect(sql).toContain('@c1');
      expect(sql).not.toContain('RCVBAS');
      expect(sql).toContain('maplantar');
    });

    it('rechaza lista vacía o demasiado grande', () => {
      expect(() => buildCoberturasQuery([])).toThrow(RangeError);
      const muchos = Array.from({ length: LIMIT_MAX + 1 }, (_, i) => ({ cramo: 18, cplan: String(i) }));
      expect(() => buildCoberturasQuery(muchos)).toThrow(RangeError);
    });
  });
});

describe('ClientService.searchVehiclePolicies', () => {
  function crearServicio(respuestas: Record<string, unknown>[][]) {
    const consultas: string[] = [];
    const db: any = {
      types: {
        VarChar: (n: number) => ({ t: 'varchar', n }),
        Numeric: (p: number, s: number) => ({ t: 'numeric', p, s }),
        Int: { t: 'int' },
      },
      request: () => ({
        input: jest.fn(),
        query: jest.fn(async (sql: string) => {
          consultas.push(sql);
          return { recordset: respuestas.shift() ?? [] };
        }),
      }),
    };
    return { service: new ClientService(db), consultas };
  }

  const fila = (n: number) => ({
    cpoliza: String(n), fanopol: 2026, fmespol: 3, cnpoliza: `18-1-${n}`, cramo: 18, cplan: n === 1 ? 'RCVBAS' : 'AMPLIA1', xplaca: 'AB385WR',
    casegurado: 99, xasegurado: 'ASEGURADO', ctenedor: 99, ccerti: 1,
  });

  it('exige criterios mínimos con 400', async () => {
    const { service } = crearServicio([]);
    await expect(service.searchVehiclePolicies({ marca: 'TOYOTA' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin coincidencias devuelve vacío y no consulta coberturas', async () => {
    const { service, consultas } = crearServicio([[]]);
    const r = await service.searchVehiclePolicies({ placa: 'ZZZ999' });
    expect(r.items).toEqual([]);
    expect(r.hasMore).toBe(false);
    expect(consultas).toHaveLength(1);
  });

  it('adjunta las coberturas del plan a cada póliza y detecta la página siguiente', async () => {
    const filas = [fila(1), fila(2), fila(3)]; // limit 2 → 3 filas = hay más
    const cobs = [
      { cramo: 18, cplan: 'RCVBAS', ccobertura: 7, xcobertura: 'DAÑOS A COSAS', msumamax: 1000 },
      { cramo: 18, cplan: 'AMPLIA1', ccobertura: 1, xcobertura: 'COBERTURA AMPLIA', msumamax: 5000 },
    ];
    const { service, consultas } = crearServicio([filas, cobs]);

    const r = await service.searchVehiclePolicies({ placa: 'AB385WR', limit: 2 });

    expect(r.items).toHaveLength(2);
    expect(r.hasMore).toBe(true);
    expect(r.items[0].coberturas.map((c: any) => c.ccobertura)).toEqual([7]);
    expect(r.items[1].coberturas.map((c: any) => c.ccobertura)).toEqual([1]);
    expect(consultas).toHaveLength(2);
  });

  it('devuelve el número de póliza de 19 dígitos intacto (texto)', async () => {
    const f = { ...fila(1), cpoliza: '9000000000654123456' };
    const { service } = crearServicio([[f], []]);
    const r = await service.searchVehiclePolicies({ placa: 'AB385WR' });
    expect(r.items[0].poliza.cpoliza).toBe('9000000000654123456');
  });

  it('placa inválida responde 400, no 500', async () => {
    const { service } = crearServicio([]);
    await expect(service.searchVehiclePolicies({ placa: "X'; DROP TABLE adpoliza;--" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
