import { BadRequestException } from '@nestjs/common';
import { CondominioService } from './condominio.service';
import { CotizacionPreestablecidaDto } from './dto/cotizacion-preestablecida.dto';

/** Valida la cotización preestablecida contra tarifas simuladas del Core (sin base de datos). */
function buildService(pprima = 0.5, pcomision = 20, descPct = 8, recPct = 10) {
  const request = () => {
    const req: any = {
      input: () => req,
      query: async (sql: string) => {
        if (/FROM matarifa_d/.test(sql)) {
          return { recordset: [{ ccober: '1', ctarifa: '1', xcobertura: 'BASICA', pprima, pcomision, fultmod: null, cusuariomod: null }] };
        }
        if (/FROM madisseg/.test(sql)) return { recordset: [{ pct: descPct }] };
        if (/FROM masustac/.test(sql)) return { recordset: [{ pct: recPct }] };
        return { recordset: [] };
      },
    };
    return req;
  };
  const db: any = { request, types: { Int: 'Int', Char: () => 'Char', Numeric: () => 'Numeric' } };
  return new CondominioService(db, {} as any);
}

const cotizacionOk = (): CotizacionPreestablecidaDto => ({
  suma_asegurada: 1000,
  prima_total: 5.4,
  descuento_pct: 8,
  recargo_pct: 10,
  coberturas: [
    // bruta 1000×0.5% = 5 · desc 0.40 · rec 0.50 · neta 5.10 → ajustada abajo
    { ccober: '1', ctarifa: '1', suma_asegurada: 1000, prima_bruta: 5, descuento: 0.4, recargo: 0.5, prima: 5.1, pcomision: 20, comision: 1.02 },
  ],
});

describe('CondominioService.validarCotizacionPreestablecida', () => {
  const validar = (svc: CondominioService, cot: CotizacionPreestablecidaDto) =>
    (svc as any).validarCotizacionPreestablecida(16, cot, [1], [1]);

  it('acepta una cotización que cuadra con las tarifas del Core', async () => {
    const cot = cotizacionOk();
    cot.prima_total = 5.1;
    await expect(validar(buildService(), cot)).resolves.toBeUndefined();
  });

  it('rechaza una prima alterada', async () => {
    const cot = cotizacionOk();
    cot.coberturas[0].prima_bruta = 1;
    cot.coberturas[0].prima = 0.9;
    cot.prima_total = 0.9;
    await expect(validar(buildService(), cot)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una cobertura sin tarifa en el Core', async () => {
    const cot = cotizacionOk();
    cot.prima_total = 5.1;
    cot.coberturas[0].ccober = '99';
    await expect(validar(buildService(), cot)).rejects.toThrow(/no tiene tarifa vigente/);
  });

  it('rechaza un total que no coincide con la suma de primas', async () => {
    const cot = cotizacionOk();
    cot.prima_total = 9;
    await expect(validar(buildService(), cot)).rejects.toThrow(/prima_total/);
  });

  it('rechaza si la tasa del Core es 0 y la cotización trae prima', async () => {
    const cot = cotizacionOk();
    cot.prima_total = 5.1;
    await expect(validar(buildService(0), cot)).rejects.toBeInstanceOf(BadRequestException);
  });
});
