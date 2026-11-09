import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmitirCoberturasDto } from './dto/riesgos-generales.dto';
import { RiesgosGeneralesService } from './riesgos-generales.service';
import {
  calcularCoberturasRamo, erroresCoberturasSp, parsearRamosEmision, traducirDuplicadoSp, type CoberturaRamo,
} from './riesgos-generales.calculo';

/** Cobertura del ramo (GET coberturas) ya mapeada. */
const cr = (ccober: string, extra: Partial<CoberturaRamo> = {}): CoberturaRamo => ({
  ccober, ctarifa: '1', xcobertura: `COB ${ccober}`, cmoneda: '$', obligatoria: ccober === '1', pprima: 0.5, mprima: 0,
  msumamin: 0, msumamax: 0, pcomision: 10, ...extra,
});

describe('parsearRamosEmision', () => {
  it('sin valor o sin números válidos: 16, 25 y 38 como hasta ahora', () => {
    expect(parsearRamosEmision(undefined)).toEqual([16, 25, 38]);
    expect(parsearRamosEmision('')).toEqual([16, 25, 38]);
    expect(parsearRamosEmision('x, ,0')).toEqual([16, 25, 38]);
  });

  it('lista separada por comas, sin repetidos y nunca RCV (26)', () => {
    expect(parsearRamosEmision(' 16, 27,27 ,26,38 ')).toEqual([16, 27, 38]);
  });

  it("'todos' sin importar mayúsculas", () => {
    expect(parsearRamosEmision(' TODOS ')).toBe('todos');
  });
});

describe('calcularCoberturasRamo (modo combo)', () => {
  const catalogo = [cr('1'), cr('5', { pprima: 0, mprima: 35 }), cr('7', { ctarifa: '1' }), cr('7', { ctarifa: '2', pprima: 1 })];

  it('prima = suma × tasa / 100 o la prima fija si no hay tasa; graba la ctarifa elegida', () => {
    const { cotizacion, errores } = calcularCoberturasRamo(catalogo, [
      { ccober: '1', suma: 10000 }, { ccober: '5', suma: 2000 }, { ccober: '7', ctarifa: '2', suma: 1000 },
    ]);
    expect(errores).toEqual([]);
    expect(cotizacion!.coberturas.map((c) => [c.ccober, c.ctarifa, c.prima])).toEqual([['1', '1', 50], ['5', '1', 35], ['7', '2', 10]]);
    expect([cotizacion!.suma_asegurada, cotizacion!.prima_total, cotizacion!.comision_total]).toEqual([10000, 95, 9.5]);
  });

  it('rechaza coberturas de otro ramo, sin tarifa elegida si hay varias, y exige las obligatorias', () => {
    const { cotizacion, errores } = calcularCoberturasRamo(catalogo, [{ ccober: '99', suma: 1 }, { ccober: '7', suma: 1 }]);
    expect(cotizacion).toBeNull();
    expect(errores).toEqual([
      'La cobertura 99 no es del ramo o no tiene tarifa vigente.',
      'La cobertura 7 tiene varias tarifas vigentes (1, 2): indique ctarifa.',
      'COB 1 es obligatoria.',
    ]);
  });
});

describe('erroresCoberturasSp y traducirDuplicadoSp', () => {
  it('exactamente una fila en matarifa_d; 0 o más de una es error claro', () => {
    const f = (ccober: string, iestado: string | null, qtarifa: number, qdetalle: number) => ({ ccober, ctarifa: '1', iestado, qtarifa, qdetalle });
    expect(erroresCoberturasSp(27, [f('1', 'V', 1, 1)])).toEqual([]);
    expect(erroresCoberturasSp(27, [f('2', null, 0, 0), f('3', 'I', 1, 1), f('4', 'V', 0, 0), f('5', 'V', 1, 0), f('6', 'V', 1, 2)])).toEqual([
      'La cobertura 2 (tarifa 1) no existe en el ramo 27.',
      'La cobertura 3 (tarifa 1) no está activa en el ramo 27.',
      'La cobertura 4 (tarifa 1) no se puede emitir: no tiene tarifa en matarifa; avisar a La Mundial.',
      'La cobertura 5 (tarifa 1) no se puede emitir: tarifa sin detalle en matarifa_d; avisar a La Mundial.',
      'La cobertura 6 (tarifa 1) no se puede emitir: tarifa con detalle repetido en matarifa_d (2 filas); avisar a La Mundial.',
    ]);
  });

  it('traduce los dos duplicados del SP y deja pasar los demás errores', () => {
    expect(traducirDuplicadoSp('Se ha detectado la existencia de una poliza vigente con el mismo asegurado y plan.', 27, 'X1'))
      .toContain('ya tiene una póliza vigente del plan X1 en el ramo 27');
    expect(traducirDuplicadoSp('Se ha detectado la existencia de una poliza vigente con el mismo asegurado, plan y apartamento.', 28, 'P1', 5))
      .toContain('para la unidad 5');
    expect(traducirDuplicadoSp('El plan enviado no se encuentra registrado en el sistema.', 27, 'X1')).toBeNull();
  });
});

describe('RiesgosGeneralesService.emitir (ramos configurables y validación previa al SP)', () => {
  type Detalle = { iestado?: string | null; qtarifa?: number; qdetalle?: number };
  interface Opciones {
    ramos?: string;
    plan?: { iestado: string | null; cramo_otro?: number | null; qramo?: number; ptasamon?: number };
    catalogo?: Record<string, unknown>[];
    detalle?: Record<string, Detalle>;
    errorSp?: string;
  }

  /** Mock por consulta: contexto del plan (maramos), validación (OPENJSON), coberturas del ramo, tarifa del plan y recibo. */
  function crear(o: Opciones = {}) {
    const inputs: Record<string, unknown> = {};
    const consultas: string[] = [];
    const execute = jest.fn(async () => {
      if (o.errorSp) throw new Error(o.errorSp);
      return { recordset: [{ cnpoliza: '27-1-1', cpoliza: '1' }] };
    });
    const catalogo = o.catalogo ?? [
      { ccober: '1', ctarifa: '1', xcobertura: 'BASICA', cmoneda: '$', bobligatoria: 'T', pprima: 0.5, mprima: 0, msumamin: 0, msumamax: 0, pcomision: 10 },
      { ccober: '5', ctarifa: '3', xcobertura: 'ROTURA', cmoneda: '$', bobligatoria: 'F', pprima: 0, mprima: 20, msumamin: 0, msumamax: 0, pcomision: 10 },
    ];
    const req = {
      input(k: string, ...v: unknown[]) { inputs[k] = v[v.length - 1]; return req; },
      query: async (texto: string) => {
        if (texto.includes('maramos')) {
          consultas.push('contexto');
          const p = o.plan ?? { iestado: 'V' };
          return { recordset: [{ iestado: p.iestado, cmoneda: '$', ptasamon: p.ptasamon ?? 1, cramo_otro: p.cramo_otro ?? null, qramo: p.qramo ?? 1 }] };
        }
        if (texto.includes('OPENJSON')) {
          consultas.push('validacion');
          const pedidas = JSON.parse(String(inputs.coberturas)) as { ccober: string; ctarifa: string }[];
          return {
            recordset: pedidas.map((c) => {
              const d = o.detalle?.[c.ccober] ?? {};
              return { ...c, iestado: d.iestado === undefined ? 'V' : d.iestado, qtarifa: d.qtarifa ?? 1, qdetalle: d.qdetalle ?? 1 };
            }),
          };
        }
        if (texto.includes('maplantar')) {
          consultas.push('tarifa');
          return { recordset: [{ cplan: 'P1', xplan: 'PLAN', cmoneda: '$', ccober: '1', ctarifa: '1', xcobertura: 'BASICA', msumaplan: 0, bobligatoria: 'T', pprima: 0.5, msumamin: 0, msumamax: 0, pcomision: 10 }] };
        }
        if (texto.includes('macoberturas')) { consultas.push('coberturas'); return { recordset: catalogo }; }
        if (texto.includes('adrecibos')) return { recordset: [{ cnrecibo: '27-1' }] };
        throw new Error(`consulta inesperada: ${texto.slice(0, 60)}`);
      },
      execute,
    };
    const T: any = new Proxy(function () {}, { get: () => T, apply: () => T });
    const config = { get: (k: string) => (k === 'RIESGOS_GENERALES_RAMOS_EMISION' ? o.ramos : 'http://pdf') };
    return { inputs, consultas, execute, service: new RiesgosGeneralesService({ types: T, request: () => req } as never, config as never) };
  }

  const persona = { tipo_cedula: 'V', rif: '12345678', nombre: 'JUAN' };
  const combo27 = {
    cramo: 27, cplan: 'X1', modo: 'combo' as const, coberturas: [{ ccober: '1', suma: 10000 }, { ccober: '5', suma: 3000 }],
    tomador: persona, bien: 'Local comercial', direccion_riesgo: 'Caracas',
  };

  it('ramo fuera de la lista (por defecto 16, 25 y 38): 400 sin consultar ni llamar al SP', async () => {
    const { service, execute, consultas } = crear();
    await expect(service.emitir(combo27)).rejects.toThrow('El ramo 27 no está habilitado para emitir por coberturas (ramos habilitados: 16, 25, 38).');
    expect(consultas).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('RCV (26) nunca, aunque la variable diga todos', async () => {
    const { service } = crear({ ramos: 'todos' });
    await expect(service.emitir({ ...combo27, cramo: 26 })).rejects.toThrow('RCV');
  });

  it("'todos' exige ramo patrimonial vigente", async () => {
    const { service, execute } = crear({ ramos: 'todos', plan: { iestado: 'V', qramo: 0 } });
    await expect(service.emitir(combo27)).rejects.toThrow('no es un ramo patrimonial vigente');
    expect(execute).not.toHaveBeenCalled();
  });

  it('emite un ramo nuevo de la lista con las coberturas del ramo y el plan como contenedor', async () => {
    const { service, execute, inputs, consultas } = crear({ ramos: '16,25,38,27', plan: { iestado: 'V', ptasamon: 40 } });
    const r = await service.emitir(combo27);
    expect(r.cnpoliza).toBe('27-1-1');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(consultas).toEqual(['contexto', 'coberturas', 'validacion']);
    expect(JSON.parse(String(inputs.coberturas))).toEqual([
      { ccober: '1', ctarifa: '1', msumaasegext: 10000, mprimabrutaext: 50, mdescuentoext: 0, mrecargoext: 0, mprimaext: 50, pcomision: 10, mcomisionext: 5 },
      { ccober: '5', ctarifa: '3', msumaasegext: 3000, mprimabrutaext: 20, mdescuentoext: 0, mrecargoext: 0, mprimaext: 20, pcomision: 10, mcomisionext: 2 },
    ]);
    expect([inputs.cramo, inputs.cplan, inputs.mprimaext, inputs.mprima, inputs.ptasamon]).toEqual([27, 'X1', 70, 2800, 40]);
  });

  it('cobertura de otro ramo: 400 antes del SP', async () => {
    const { service, execute } = crear({ ramos: '27' });
    await expect(service.emitir({ ...combo27, coberturas: [{ ccober: '1', suma: 1000 }, { ccober: '88', suma: 10 }] }))
      .rejects.toThrow('La cobertura 88 no es del ramo o no tiene tarifa vigente.');
    expect(execute).not.toHaveBeenCalled();
  });

  it('cobertura inexistente o inactiva en macoberturas (modo plan): 400 antes del SP', async () => {
    const { service, execute } = crear({ ramos: '27', detalle: { '1': { iestado: null } } });
    await expect(service.emitir({ ...combo27, modo: 'plan', cplan: 'P1', coberturas: [{ ccober: '1', suma: 1000 }] }))
      .rejects.toThrow('La cobertura 1 (tarifa 1) no existe en el ramo 27.');
    expect(execute).not.toHaveBeenCalled();
  });

  it('tarifa con 0 filas en matarifa_d: 400 claro y no llama al SP', async () => {
    const { service, execute } = crear({ ramos: '27', detalle: { '5': { qdetalle: 0 } } });
    await expect(service.emitir(combo27)).rejects.toThrow('La cobertura 5 (tarifa 3) no se puede emitir: tarifa sin detalle en matarifa_d; avisar a La Mundial.');
    expect(execute).not.toHaveBeenCalled();
  });

  it('tarifa con 2 filas en matarifa_d: 400 claro y no llama al SP', async () => {
    const { service, execute } = crear({ ramos: '27', detalle: { '1': { qdetalle: 2 } } });
    await expect(service.emitir(combo27)).rejects.toThrow('tarifa con detalle repetido en matarifa_d (2 filas); avisar a La Mundial.');
    expect(execute).not.toHaveBeenCalled();
  });

  it('plan de otro ramo o no vigente: 400 claro antes de cotizar', async () => {
    const otro = crear({ ramos: '27', plan: { iestado: null, cramo_otro: 38 } });
    await expect(otro.service.emitir(combo27)).rejects.toThrow('El plan X1 no es del ramo 27 (es del ramo 38)');
    expect(otro.consultas).toEqual(['contexto']);
    const vencido = crear({ ramos: '27', plan: { iestado: 'A' } });
    await expect(vencido.service.emitir(combo27)).rejects.toThrow('no está vigente');
    const nada = crear({ ramos: '27', plan: { iestado: null } });
    await expect(nada.service.emitir(combo27)).rejects.toThrow('El plan X1 no existe en el ramo 27');
  });

  it('ramo 28 sin apartamento: 400 en el servicio y en el DTO', async () => {
    const { service, consultas } = crear({ ramos: '28' });
    await expect(service.emitir({ ...combo27, cramo: 28 })).rejects.toThrow('En el ramo 28 el número de apartamento o unidad es obligatorio');
    expect(consultas).toEqual([]);
    const errores = async (datos: object) => (await validate(plainToInstance(EmitirCoberturasDto, { ...combo27, ...datos })))
      .filter((e) => e.property === 'apartamento').flatMap((e) => Object.values(e.constraints ?? {}));
    expect(await errores({ cramo: 28 })).toContain('En los ramos 28 y 38 el número de apartamento o unidad es obligatorio (entero mayor a 0).');
    expect(await errores({ cramo: 28, apartamento: 4 })).toEqual([]);
    expect(await errores({ cramo: 27 })).toEqual([]);
  });

  it('con apartamento, el ramo 28 lo manda al SP y traduce su duplicado a 409', async () => {
    const { service, inputs } = crear({
      ramos: '28', errorSp: 'Se ha detectado la existencia de una poliza vigente con el mismo asegurado, plan y apartamento.',
    });
    const err = await service.emitir({ ...combo27, cramo: 28, apartamento: 7 }).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.message).toContain('plan X1 (ramo 28) para la unidad 7');
    expect([inputs.napartamento, inputs.ccerti]).toEqual([7, 7]);
  });

  it('duplicado asegurado + plan en otros ramos: 409 con mensaje claro', async () => {
    const { service } = crear({ ramos: '27', errorSp: 'Se ha detectado la existencia de una poliza vigente con el mismo asegurado y plan.' });
    const err = await service.emitir(combo27).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.message).toContain('Elija otro plan contenedor del ramo');
  });
});
