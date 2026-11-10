import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmitirCoberturasDto } from './dto/riesgos-generales.dto';
import { RiesgosGeneralesService } from './riesgos-generales.service';
import {
  calcularCoberturasInformadas, normalizarMoneda, parsearRamosCotizador, toleranciaPrima, type CoberturaRamo,
} from './riesgos-generales.calculo';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';

/** Cobertura del ramo sin tarifa en Sis2000 (pprima y mprima 0), como las de los ramos 27, 28 y 37 en QA. */
const cr = (ccober: string, extra: Partial<CoberturaRamo> = {}): CoberturaRamo => ({
  ccober, ctarifa: '1', xcobertura: `COB ${ccober}`, cmoneda: '$', obligatoria: ccober === '1', pprima: 0, mprima: 0,
  msumamin: 0, msumamax: 0, pcomision: 10, ...extra,
});

describe('parsearRamosCotizador', () => {
  it('por defecto 27, 28 y 37; lista explícita sin repetidos ni RCV; sin "todos"', () => {
    expect(parsearRamosCotizador(undefined)).toEqual([27, 28, 37]);
    expect(parsearRamosCotizador('todos')).toEqual([27, 28, 37]);
    expect(parsearRamosCotizador(' 27,28, 37,16,16,26 ')).toEqual([27, 28, 37, 16]);
  });
});

describe('normalizarMoneda y toleranciaPrima', () => {
  it('unifica los códigos de moneda', () => {
    expect(['$', 'US$', 'usd', 'BS', 'Bs.', 'VES', 'EUR', '€'].map(normalizarMoneda)).toEqual(['USD', 'USD', 'USD', 'BS', 'BS', 'BS', 'EUR', 'EUR']);
  });
  it('medio céntimo por cobertura, mínimo un céntimo', () => {
    expect([toleranciaPrima(1), toleranciaPrima(4), toleranciaPrima(10)]).toEqual([0.01, 0.02, 0.05]);
  });
});

describe('calcularCoberturasInformadas (modo cotizador)', () => {
  const catalogo = [cr('1', { msumamin: 1000, msumamax: 2000 }), cr('2'), cr('7', { ctarifa: '1' }), cr('7', { ctarifa: '2' }), cr('29', { cmoneda: 'BS' })];

  it('acepta la prima informada sin recalcular ni aplicar topes de matarifa_d; la tasa sale de prima / suma', () => {
    const { cotizacion, errores } = calcularCoberturasInformadas(catalogo, [
      { ccober: '1', suma: 50000, prima: 400 }, { ccober: '2', suma: 15000, prima: 0 }, { ccober: '7', ctarifa: '2', suma: 100, prima: 10.5 },
    ], 410.5, '$');
    expect(errores).toEqual([]);
    expect(cotizacion!.coberturas.map((c) => [c.ccober, c.ctarifa, c.suma_asegurada, c.prima, c.pprima, c.comision])).toEqual([
      ['1', '1', 50000, 400, 0.8, 40], ['2', '1', 15000, 0, 0, 0], ['7', '2', 100, 10.5, 10.5, 1.05],
    ]);
    expect([cotizacion!.suma_asegurada, cotizacion!.prima_total, cotizacion!.comision_total]).toEqual([50000, 410.5, 41.05]);
  });

  it('tolera el redondeo y emite la suma de las primas por cobertura', () => {
    const { cotizacion } = calcularCoberturasInformadas(catalogo, [{ ccober: '1', suma: 1, prima: 100.01 }, { ccober: '2', suma: 1, prima: 0.01 }], 100.01);
    expect(cotizacion!.prima_total).toBe(100.02);
  });

  it('rechaza total distinto de la suma de primas', () => {
    const { cotizacion, errores } = calcularCoberturasInformadas(catalogo, [{ ccober: '1', suma: 1000, prima: 100 }], 120);
    expect(cotizacion).toBeNull();
    expect(errores).toEqual(['La prima total (120) no coincide con la suma de las primas por cobertura (100).']);
  });

  it('nunca prima total 0; suma > 0, prima obligatoria y ≥ 0, cobertura del ramo, sin repetir y ctarifa si hay varias', () => {
    const { errores } = calcularCoberturasInformadas(catalogo, [
      { ccober: '1', suma: 0, prima: 0 }, { ccober: '2', suma: 10 }, { ccober: '2', suma: 10, prima: -1 },
      { ccober: '99', suma: 1, prima: 1 }, { ccober: '7', suma: 1, prima: 1 },
    ], 0);
    expect(errores).toEqual([
      'COB 1: la suma debe ser mayor a 0.',
      'COB 2: falta la prima de la cobertura.',
      'La cobertura 2 está repetida.',
      'COB 2: la prima no puede ser negativa.',
      'La cobertura 99 no es del ramo o no tiene tarifa vigente.',
      'La cobertura 7 tiene varias tarifas vigentes (1, 2): indique ctarifa.',
      'La prima total debe ser mayor a 0: no se emite una póliza sin prima.',
    ]);
  });

  it('no mezcla monedas y exige la del plan contenedor', () => {
    expect(calcularCoberturasInformadas(catalogo, [{ ccober: '1', suma: 1, prima: 1 }, { ccober: '29', suma: 1, prima: 1 }], 2).errores)
      .toEqual(['Las coberturas mezclan monedas (USD, BS): use las de una sola moneda.']);
    expect(calcularCoberturasInformadas(catalogo, [{ ccober: '29', suma: 1, prima: 1 }], 1, '$').errores)
      .toEqual(['Las coberturas son en BS y el plan contenedor en USD: elija un plan de la misma moneda.']);
    expect(calcularCoberturasInformadas(catalogo, [{ ccober: '29', suma: 1, prima: 1 }], 1, 'Bs').errores).toEqual([]);
  });
});

describe('RiesgosGeneralesService.emitir modo cotizador (protección y SP)', () => {
  const SCOPE = NEST_AUTH_SCOPES.EMISSIONS_RIESGOS_GENERALES_PRIMA;
  interface Opciones { env?: Record<string, string>; qramo?: number; cmoneda?: string; errorSp?: string }

  function crear(o: Opciones = {}) {
    const inputs: Record<string, unknown> = {};
    const consultas: string[] = [];
    const execute = jest.fn(async () => {
      if (o.errorSp) throw new Error(o.errorSp);
      return { recordset: [{ cnpoliza: '28-1-1', cpoliza: '1' }] };
    });
    const catalogo = [
      { ccober: '1', ctarifa: '1', xcobertura: 'BASICA', cmoneda: '$', bobligatoria: 'T', pprima: 0, mprima: 0, msumamin: 1000, msumamax: 2000, pcomision: 10 },
      { ccober: '2', ctarifa: '1', xcobertura: 'VECINOS', cmoneda: '$', bobligatoria: 'F', pprima: 0, mprima: 0, msumamin: 0, msumamax: 0, pcomision: 10 },
    ];
    const req = {
      input(k: string, ...v: unknown[]) { inputs[k] = v[v.length - 1]; return req; },
      query: async (texto: string) => {
        if (texto.includes('maramos')) {
          consultas.push('contexto');
          return { recordset: [{ iestado: 'V', cmoneda: o.cmoneda ?? '$', ptasamon: 1, cramo_otro: null, qramo: o.qramo ?? 1 }] };
        }
        if (texto.includes('OPENJSON')) {
          consultas.push('validacion');
          const pedidas = JSON.parse(String(inputs.coberturas)) as { ccober: string; ctarifa: string }[];
          return { recordset: pedidas.map((c) => ({ ...c, iestado: 'V', qtarifa: 1, qdetalle: 1 })) };
        }
        if (texto.includes('macoberturas')) { consultas.push('coberturas'); return { recordset: catalogo }; }
        if (texto.includes('adrecibos')) return { recordset: [{ cnrecibo: '28-1' }] };
        throw new Error(`consulta inesperada: ${texto.slice(0, 60)}`);
      },
      execute,
    };
    const T: any = new Proxy(function () {}, { get: () => T, apply: () => T });
    const env: Record<string, string> = { RIESGOS_GENERALES_EMISION_COTIZADOR: 'true', ...(o.env ?? {}) };
    const config = { get: (k: string) => (k in env ? env[k] : k.startsWith('RIESGOS') ? undefined : 'http://pdf') };
    return { inputs, consultas, execute, service: new RiesgosGeneralesService({ types: T, request: () => req } as never, config as never) };
  }

  const persona = { tipo_cedula: 'J', rif: '123456789', nombre: 'EMPRESA' };
  const rcg = {
    cramo: 28, cplan: 'PLANI', modo: 'cotizador' as const, cotizador: 'rcg' as const, ncotizacion: 'RCG-2026-P000001', apartamento: 1,
    coberturas: [{ ccober: '1', suma: 50000, prima: 400 }, { ccober: '2', suma: 15000, prima: 0 }], prima_total: 400,
    tomador: persona, bien: 'Oficinas', direccion_riesgo: 'Caracas',
  };

  it('apagado por defecto: 403 sin consultar ni llamar al SP', async () => {
    const { service, execute, consultas } = crear({ env: { RIESGOS_GENERALES_EMISION_COTIZADOR: '' } });
    const err = await service.emitir(rcg, [SCOPE]).catch((e) => e);
    expect(err.getStatus()).toBe(403);
    expect(err.message).toContain('RIESGOS_GENERALES_EMISION_COTIZADOR');
    expect(consultas).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('sin el scope explícito: 403; los comodines no cuentan', async () => {
    for (const scopes of [undefined, [], ['*'], ['emissions:*'], ['emissions:riesgos-generales']]) {
      const { service, execute } = crear();
      const err = await service.emitir(rcg, scopes).catch((e) => e);
      expect(err.getStatus()).toBe(403);
      expect(err.message).toContain(SCOPE);
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it('ramo fuera de RIESGOS_GENERALES_COTIZADOR_RAMOS o no patrimonial: 400', async () => {
    const fuera = crear({ env: { RIESGOS_GENERALES_COTIZADOR_RAMOS: '27,37' } });
    await expect(fuera.service.emitir(rcg, [SCOPE])).rejects.toThrow('El ramo 28 no está habilitado para emitir con prima informada (ramos habilitados: 27, 37).');
    const rcv = crear({ env: { RIESGOS_GENERALES_COTIZADOR_RAMOS: '26,28' } });
    await expect(rcv.service.emitir({ ...rcg, cramo: 26 }, [SCOPE])).rejects.toThrow('RCV');
    const noPat = crear({ qramo: 0 });
    await expect(noPat.service.emitir(rcg, [SCOPE])).rejects.toThrow('no es un ramo patrimonial vigente');
    expect(noPat.execute).not.toHaveBeenCalled();
  });

  it('no depende de RIESGOS_GENERALES_RAMOS_EMISION y graba la prima informada tal cual en el SP', async () => {
    const { service, execute, inputs, consultas } = crear({ env: { RIESGOS_GENERALES_RAMOS_EMISION: '16' } });
    const r = await service.emitir(rcg, [SCOPE, 'emissions:riesgos-generales']);
    expect(r.cnpoliza).toBe('28-1-1');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(consultas).toEqual(['contexto', 'coberturas', 'validacion']);
    expect(JSON.parse(String(inputs.coberturas))).toEqual([
      { ccober: '1', ctarifa: '1', msumaasegext: 50000, mprimabrutaext: 400, mdescuentoext: 0, mrecargoext: 0, mprimaext: 400, pcomision: 10, mcomisionext: 40 },
      { ccober: '2', ctarifa: '1', msumaasegext: 15000, mprimabrutaext: 0, mdescuentoext: 0, mrecargoext: 0, mprimaext: 0, pcomision: 10, mcomisionext: 0 },
    ]);
    expect([inputs.mprimaext, inputs.msumaasegext, inputs.cplan, inputs.ccerti]).toEqual([400, 50000, 'PLANI', 1]);
    expect(inputs.xdescrip3).toBe('Cotización: RCG RCG-2026-P000001');
  });

  it('prima total distinta de la suma o en 0: 400 antes del SP', async () => {
    const { service, execute } = crear();
    await expect(service.emitir({ ...rcg, prima_total: 500 }, [SCOPE])).rejects.toThrow('no coincide con la suma de las primas');
    await expect(service.emitir({ ...rcg, coberturas: [{ ccober: '1', suma: 1, prima: 0 }], prima_total: 0 }, [SCOPE])).rejects.toThrow('mayor a 0');
    expect(execute).not.toHaveBeenCalled();
  });

  it('plan contenedor en otra moneda: 400', async () => {
    const { service, execute } = crear({ cmoneda: 'BS' });
    await expect(service.emitir(rcg, [SCOPE])).rejects.toThrow('el plan contenedor en BS');
    expect(execute).not.toHaveBeenCalled();
  });

  it('duplicado del SP: 409 con mensaje claro', async () => {
    const { service } = crear({ errorSp: 'Se ha detectado la existencia de una poliza vigente con el mismo asegurado, plan y apartamento.' });
    const err = await service.emitir(rcg, [SCOPE]).catch((e) => e);
    expect(err.getStatus()).toBe(409);
  });

  it('cotizar no acepta el modo cotizador', async () => {
    const { service } = crear();
    await expect(service.cotizar({ ...rcg, cramo: 38 })).rejects.toThrow('solo se usa para emitir');
  });

  it('DTO: con modo cotizador exige prima_total, cotizador y ncotizacion', async () => {
    const props = async (datos: object) => (await validate(plainToInstance(EmitirCoberturasDto, datos))).map((e) => e.property);
    const { prima_total, cotizador, ncotizacion, ...sin } = rcg;
    void prima_total; void cotizador; void ncotizacion;
    expect(await props(sin)).toEqual(expect.arrayContaining(['prima_total', 'cotizador', 'ncotizacion']));
    expect(await props(rcg)).toEqual([]);
    expect(await props({ ...sin, modo: 'combo' })).toEqual([]);
  });
});
