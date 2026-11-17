import { BadRequestException } from '@nestjs/common';
import { CondominioService } from './condominio.service';

/**
 * Reparto con coberturas opcionales, límite por cobertura y montos fijos (cotizador de Técnica, nov-2026).
 * Caso de control del prototipo: Residencial, 2019 en adelante, USD 160.000, todas las opcionales y sin asistencia = 805,74.
 */
const TASAS_PROTOTIPO: [string, number, number][] = [
  ['R', 1, 0.628125], ['R', 2, 0.58125], ['R', 3, 0.534375], ['R', 4, 0.4875],
  ['C', 1, 0.69375], ['C', 2, 0.6375], ['C', 3, 0.58125], ['C', 4, 0.525],
];

const P = (ccober: string, pvalor: number, extra: object = {}) => ({ ccober, ctarifa: '1', itipo: 'P', pvalor, iopcional: false, plimite: null, ...extra });
const REPARTO = [
  P('1', 20),
  P('26', 13, { plimite: 2.5 }),
  P('29', 4, { plimite: 5 }),
  P('3', 15, { iopcional: true, plimite: 30 }),
  P('4', 12, { iopcional: true, plimite: 10 }),
  P('5', 12, { iopcional: true, plimite: 15 }),
  P('30', 12, { iopcional: true, plimite: 0.75 }),
  P('33', 12, { iopcional: true, plimite: 3 }),
  { ccober: '2', ctarifa: '1', itipo: 'F', pvalor: 0.12, iopcional: true, plimite: null },
  // Daños al local y las demás de prima fija simbólica (USD 0,02)
  ...['28', '7', '8', '9', '11', '14', '15'].map((ccober) => ({
    ccober, ctarifa: '1', itipo: 'M', pvalor: 0.02, iopcional: false, plimite: ccober === '28' ? 0.25 : 0.5,
  })),
];

function buildService(reparto: any[], { extendido = true } = {}) {
  const request = () => {
    const req: any = {
      input: () => req,
      query: async (sql: string) => {
        if (/OBJECT_ID/.test(sql)) return { recordset: [{ tasas: 1, reparto: 2, opcional: extendido ? 1 : null }] };
        if (/MATARIFA_ANTIGUEDAD_NEXUS/.test(sql)) {
          return { recordset: TASAS_PROTOTIPO.map(([iuso, itramo, pprima]) => ({ iuso, itramo, pprima })) };
        }
        if (/MATARIFA_REPARTO_NEXUS/.test(sql)) return { recordset: reparto };
        if (/FROM matarifa_d/.test(sql)) {
          const codigos = ['1', '2', '3', '4', '5', '7', '8', '9', '11', '14', '15', '19', '26', '28', '29', '30', '33'];
          // RC General fuera del reparto: 0,08 % sobre su límite (20 % de la suma).
          return { recordset: codigos.map((ccober) => ({ ccober, ctarifa: '1', xcobertura: ccober, pprima: ccober === '19' ? 0.08 : 0.009, pcomision: 0 })) };
        }
        return { recordset: [] };
      },
    };
    return req;
  };
  const db: any = { request, types: { Int: 'Int', Char: () => 'Char', Numeric: () => 'Numeric', Bit: 'Bit', TinyInt: 'TinyInt', VarChar: () => 'VarChar' } };
  return new CondominioService(db, {} as any);
}

const SUMA = 160000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const cob = (ccober: string, suma: number, prima: number) => ({
  ccober, ctarifa: '1', suma_asegurada: suma, prima_bruta: prima, descuento: 0, recargo: 0, prima, pcomision: 0, comision: 0,
});

/** Arma la cotización como lo hace el portal: resto = 0,4875 - 0,12 = 0,3675 % repartido sobre la suma completa. */
function cotizacion(quitar: string[] = []) {
  const resto = 0.4875 - 0.12;
  const coberturas = REPARTO.filter((r) => !quitar.includes(r.ccober)).map((r) => {
    const suma = r.plimite != null ? (SUMA * r.plimite) / 100 : SUMA;
    const prima = r.itipo === 'M' ? r.pvalor : round2((SUMA * (r.itipo === 'F' ? r.pvalor : (resto * r.pvalor) / 100)) / 100);
    return cob(r.ccober, suma, prima);
  });
  if (!quitar.includes('19')) coberturas.push(cob('19', SUMA * 0.2, round2((SUMA * 0.2 * 0.08) / 100)));
  return {
    suma_asegurada: SUMA,
    prima_total: round2(coberturas.reduce((a, c) => a + c.prima, 0)),
    coberturas,
    tarifa_antiguedad: { anio_construccion: 2020, iuso: 'R' },
  };
}

describe('Condominio: reparto con opcionales, límites y montos fijos', () => {
  const validar = (svc: CondominioService, cot: any) => (svc as any).validarCotizacionPreestablecida(16, cot, [], []);

  it('caso de control del prototipo: 805,74', async () => {
    const cot = cotizacion();
    expect(cot.prima_total).toBe(805.74);
    await expect(validar(buildService(REPARTO), cot)).resolves.toBeUndefined();
  });

  it('una opcional del reparto se puede quitar y deja de cobrar su parte', async () => {
    const cot = cotizacion(['3', '2']);
    expect(cot.prima_total).toBe(round2(805.74 - 88.2 - 192));
    await expect(validar(buildService(REPARTO), cot)).resolves.toBeUndefined();
  });

  it('una cobertura obligatoria del reparto no se puede quitar', async () => {
    await expect(validar(buildService(REPARTO), cotizacion(['26']))).rejects.toThrow(/26\|1 del reparto/);
  });

  it('la suma de la cobertura debe ser su límite configurado', async () => {
    const cot = cotizacion();
    cot.coberturas.find((c) => c.ccober === '26')!.suma_asegurada = SUMA;
    await expect(validar(buildService(REPARTO), cot)).rejects.toThrow(/límite \(2.5 %/);
  });

  it('el monto fijo no depende de la suma', async () => {
    const cot = cotizacion();
    const local = cot.coberturas.find((c) => c.ccober === '28')!;
    local.prima_bruta = local.prima = 5;
    cot.prima_total = round2(cot.prima_total + 4.98);
    await expect(validar(buildService(REPARTO), cot)).rejects.toThrow(BadRequestException);
  });

  it('sin el script SQL no se guardan opcionales, límites ni montos fijos', async () => {
    const svc = buildService([], { extendido: false });
    const dto = {
      cramo: 16,
      cusuario: 1,
      tasas: TASAS_PROTOTIPO.map(([iuso, itramo, pprima]) => ({ iuso, itramo, pprima })),
      reparto: REPARTO,
    };
    await expect(svc.updateTarificadorAntiguedad(dto as any)).rejects.toThrow(/condominio-reparto-opcional\.sql/);
  });

  it('la cobertura básica no puede ser opcional', async () => {
    const svc = buildService([]);
    const dto = {
      cramo: 16,
      cusuario: 1,
      tasas: TASAS_PROTOTIPO.map(([iuso, itramo, pprima]) => ({ iuso, itramo, pprima })),
      reparto: REPARTO.map((r) => (r.ccober === '1' ? { ...r, iopcional: true } : r)),
    };
    await expect(svc.updateTarificadorAntiguedad(dto as any)).rejects.toThrow(/básica \(1\) va siempre/);
  });
});
