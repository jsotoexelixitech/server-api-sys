import { BadRequestException } from '@nestjs/common';
import { CondominioService } from './condominio.service';

/** Tarifa por antigüedad de Condominio contra tablas simuladas (sin base de datos). */
function buildService(reparto: any[]) {
  const request = () => {
    const req: any = {
      input: () => req,
      query: async (sql: string) => {
        if (/OBJECT_ID/.test(sql)) return { recordset: [{ tasas: 1, reparto: 2 }] };
        if (/MATARIFA_ANTIGUEDAD_NEXUS/.test(sql)) {
          const filas = [
            ['R', 1, 0.25125], ['R', 2, 0.2325], ['R', 3, 0.21375], ['R', 4, 0.195],
            ['C', 1, 0.2775], ['C', 2, 0.255], ['C', 3, 0.2325], ['C', 4, 0.21],
          ];
          return { recordset: filas.map(([iuso, itramo, pprima]) => ({ iuso, itramo, pprima })) };
        }
        if (/MATARIFA_REPARTO_NEXUS/.test(sql)) return { recordset: reparto };
        if (/FROM matarifa_d/.test(sql)) {
          return {
            recordset: ['1', '2', '19', '26'].map((ccober) => ({ ccober, ctarifa: '1', xcobertura: ccober, pprima: 0.009, pcomision: 0 })),
          };
        }
        return { recordset: [] };
      },
    };
    return req;
  };
  const db: any = { request, types: { Int: 'Int', Char: () => 'Char', Numeric: () => 'Numeric' } };
  return new CondominioService(db, {} as any);
}

const REPARTO = [
  { ccober: '1', ctarifa: '1', itipo: 'P', pvalor: 80 },
  { ccober: '19', ctarifa: '1', itipo: 'P', pvalor: 20 },
  { ccober: '2', ctarifa: '1', itipo: 'F', pvalor: 0.12 },
];

const cob = (ccober: string, suma: number, prima: number) => ({
  ccober, ctarifa: '1', suma_asegurada: suma, prima_bruta: prima, descuento: 0, recargo: 0, prima, pcomision: 0, comision: 0,
});

/** 1985 residencial → tramo 2: global 0,2325 · resto 0,1125 · básica 0,09 · RC 0,0225 · terremoto 0,12. */
const cotizacion = (extra: object = {}) => ({
  suma_asegurada: 200000,
  prima_total: 465,
  coberturas: [cob('1', 200000, 180), cob('19', 40000, 45), cob('2', 200000, 240)],
  tarifa_antiguedad: { anio_construccion: 1985, iuso: 'R' },
  ...extra,
});

describe('Condominio: tarifa por antigüedad', () => {
  const validar = (svc: CondominioService, cot: any, cramo = 16) =>
    (svc as any).validarCotizacionPreestablecida(cramo, cot, [], []);

  it('acepta la prima calculada con la tasa global del tramo y uso', async () => {
    await expect(validar(buildService(REPARTO), cotizacion())).resolves.toBeUndefined();
  });

  it('rechaza una prima calculada con la tasa de otro tramo', async () => {
    const cot = cotizacion({ tarifa_antiguedad: { anio_construccion: 2020, iuso: 'R' } });
    await expect(validar(buildService(REPARTO), cot)).rejects.toThrow(BadRequestException);
  });

  it('exige año y uso cuando la tarifa está configurada', async () => {
    const cot = cotizacion();
    delete (cot as any).tarifa_antiguedad;
    await expect(validar(buildService(REPARTO), cot)).rejects.toThrow(/año de construcción/);
  });

  it('exige las coberturas del reparto', async () => {
    const cot = cotizacion({ prima_total: 225, coberturas: [cob('1', 200000, 180), cob('19', 40000, 45)] });
    await expect(validar(buildService(REPARTO), cot)).rejects.toThrow(/del reparto/);
  });

  it('las opcionales siguen con su tasa de matarifa_d', async () => {
    const cot = cotizacion({
      prima_total: 465.45,
      coberturas: [cob('1', 200000, 180), cob('19', 40000, 45), cob('2', 200000, 240), cob('26', 5000, 0.45)],
    });
    await expect(validar(buildService(REPARTO), cot)).resolves.toBeUndefined();
  });

  it('sin reparto completo no aplica la tarifa por antigüedad', async () => {
    const svc = buildService([REPARTO[2]]);
    const config = await svc.getTarificadorAntiguedad(16);
    expect(config.disponible).toBe(true);
    expect(config.configurado).toBe(false);
  });

  it('1967 entra en el primer tramo y 1968 en el segundo', () => {
    const svc = buildService(REPARTO) as any;
    expect(svc.tramoPorAnio(1890)).toBe(1);
    expect(svc.tramoPorAnio(1967)).toBe(1);
    expect(svc.tramoPorAnio(1968)).toBe(2);
    expect(svc.tramoPorAnio(2018)).toBe(3);
    expect(svc.tramoPorAnio(2019)).toBe(4);
  });
});
