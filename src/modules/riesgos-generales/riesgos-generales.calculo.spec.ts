import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BiomasaDto, DatoBienDto } from './dto/riesgos-generales.dto';
import { RiesgosGeneralesService } from './riesgos-generales.service';
import {
  calcularBiomasa, datosBienBiomasa, normalizarLote, numeroVe, patronLote, type EntradaBiomasa,
} from './riesgos-generales.biomasa';
import {
  calcularCoberturas, componerDatosBien, mapCoberturaRamo, mapRamoPatrimonial, resolverSumas, sumaPorCalculo, sumarMeses, type CoberturaTarifa,
} from './riesgos-generales.calculo';

const cob = (ccober: string, pprima: number, extra: Partial<CoberturaTarifa> = {}): CoberturaTarifa => ({
  ccober, ctarifa: '1', xcobertura: `COB ${ccober}`, msumaplan: 10000, pprima, msumamin: 0, msumamax: 0,
  obligatoria: false, pcomision: 10, ...extra,
});

describe('calcularCoberturas', () => {
  const tarifa = [cob('1', 0.5), cob('4', 0.3), cob('5', 0.4, { msumamin: 1000, msumamax: 50000 })];

  it('prima = suma × tasa / 100 y suma asegurada = la de la básica', () => {
    const { cotizacion, errores } = calcularCoberturas(tarifa, [{ ccober: '1', suma: 140000 }, { ccober: '5', suma: 24000 }]);
    expect(errores).toEqual([]);
    expect(cotizacion!.coberturas.map((c) => c.prima)).toEqual([700, 96]);
    expect([cotizacion!.suma_asegurada, cotizacion!.prima_total, cotizacion!.comision_total]).toEqual([140000, 796, 79.6]);
  });

  it('exige la básica y las marcadas como obligatorias', () => {
    const t = [...tarifa, cob('16', 0.5, { obligatoria: true })];
    const { errores } = calcularCoberturas(t, [{ ccober: '4', suma: 1000 }]);
    expect(errores).toEqual(['COB 1 es obligatoria.', 'COB 16 es obligatoria.']);
  });

  it('rechaza coberturas ajenas, repetidas, fuera de tope o sin tasa', () => {
    const t = [...tarifa, cob('22', 0)];
    const { cotizacion, errores } = calcularCoberturas(t, [
      { ccober: '1', suma: 1000 }, { ccober: '1', suma: 1000 }, { ccober: '99', suma: 1 },
      { ccober: '5', suma: 60000 }, { ccober: '22', suma: 500 },
    ]);
    expect(cotizacion).toBeNull();
    expect(errores).toEqual([
      'La cobertura 1 está repetida.', 'La cobertura 99 no pertenece al plan.',
      'COB 5: la suma máxima es 50000.', 'COB 22: no tiene tasa vigente en matarifa_d.',
    ]);
  });

  it('sin calculo, cada cobertura debe traer suma (400 legible por cobertura)', () => {
    const { cotizacion, errores } = calcularCoberturas(tarifa, [{ ccober: '1' }, { ccober: '4', suma: 1000 }, { ccober: '5' }]);
    expect(cotizacion).toBeNull();
    expect(errores).toEqual([
      'La cobertura 1 no tiene suma: envíe suma o calculo.', 'La cobertura 5 no tiene suma: envíe suma o calculo.',
    ]);
  });

  it('con calculo: suma = unidades × valor_unidad en todas las coberturas e ignora la suma enviada', () => {
    const t = [cob('1', 1.666667), cob('2', 1.666667), cob('3', 1.666667)];
    const { cotizacion, errores } = calcularCoberturas(
      t, [{ ccober: '1', suma: 999 }, { ccober: '2' }, { ccober: '3' }], { unidades: 20000, valor_unidad: 2.5 },
    );
    expect(errores).toEqual([]);
    expect(cotizacion!.coberturas.map((c) => c.suma_asegurada)).toEqual([50000, 50000, 50000]);
    expect(cotizacion!.coberturas.map((c) => c.prima)).toEqual([833.33, 833.33, 833.33]);
    expect([cotizacion!.suma_asegurada, cotizacion!.prima_total]).toEqual([50000, 2499.99]);
  });

  it('con calculo aplica los topes de la tarifa sobre la suma calculada', () => {
    const { errores } = calcularCoberturas(tarifa, [{ ccober: '1' }, { ccober: '5' }], { unidades: 30000, valor_unidad: 2 });
    expect(errores).toEqual(['COB 5: la suma máxima es 50000.']);
  });
});

describe('resolverSumas y sumaPorCalculo', () => {
  it('redondea a 2 decimales', () => {
    expect(sumaPorCalculo({ unidades: 1234.5678, valor_unidad: 0.33 })).toBe(407.41);
    expect(resolverSumas([{ ccober: '1' }], { unidades: 20000, valor_unidad: 2.5 })).toEqual({
      pedidas: [{ ccober: '1', suma: 50000 }], errores: [],
    });
  });
});

describe('sumarMeses', () => {
  const ymd = (d: Date) => d.toISOString().split('T')[0];

  it('31-ago + 6 meses = 28-feb (29 en bisiesto), sin desborde de setMonth', () => {
    expect(ymd(sumarMeses(new Date('2026-08-31T00:00:00Z'), 6))).toBe('2027-02-28');
    expect(ymd(sumarMeses(new Date('2023-08-31T00:00:00Z'), 6))).toBe('2024-02-29');
  });

  it('cruza de año y conserva el día cuando existe', () => {
    expect(ymd(sumarMeses(new Date('2026-11-04T00:00:00Z'), 3))).toBe('2027-02-04');
    expect(ymd(sumarMeses(new Date('2026-11-04T00:00:00Z'), 12))).toBe('2027-11-04');
    expect(ymd(sumarMeses(new Date('2026-01-31T00:00:00Z'), 1))).toBe('2026-02-28');
  });
});

describe('mapCoberturaRamo', () => {
  const fila = { ccober: '5   ', ctarifa: '1 ', xcobertura: 'ROBO ', cmoneda: '$   ', bobligatoria: '0', pprima: 0.4 };

  it('recorta textos y pasa a número con 0 por defecto', () => {
    expect(mapCoberturaRamo({ ...fila, mprima: null, msumamin: 1000, msumamax: 50000 })).toEqual({
      ccober: '5', ctarifa: '1', xcobertura: 'ROBO', cmoneda: '$', obligatoria: false,
      pprima: 0.4, mprima: 0, msumamin: 1000, msumamax: 50000, pcomision: 0,
    });
  });

  it('obligatoria con bobligatoria T o si es la básica', () => {
    expect(mapCoberturaRamo({ ...fila, bobligatoria: 't' }).obligatoria).toBe(true);
    expect(mapCoberturaRamo({ ...fila, ccober: '1   ', bobligatoria: null }).obligatoria).toBe(true);
    expect(mapCoberturaRamo({ ...fila, bobligatoria: null }).obligatoria).toBe(false);
  });
});

describe('mapRamoPatrimonial', () => {
  it('recorta el nombre y pasa a número', () => {
    expect(mapRamoPatrimonial({ cramo: 38, xramo: 'COMBINADO RESIDENCIAL   ', ctiporamo: 6, qcoberturas: 12 })).toEqual({
      cramo: 38, xramo: 'COMBINADO RESIDENCIAL', ctiporamo: 6, qcoberturas: 12,
    });
  });

  it('sin nombre ni conteo: texto vacío y 0 coberturas', () => {
    expect(mapRamoPatrimonial({ cramo: 25, xramo: null, ctiporamo: 1, qcoberturas: null })).toEqual({
      cramo: 25, xramo: '', ctiporamo: 1, qcoberturas: 0,
    });
  });
});

describe('componerDatosBien', () => {
  it('sin datos deja ambos campos en null', () => {
    expect(componerDatosBien([])).toEqual({ xdescrip3: null, xdescrip4: null, omitidos: [] });
  });

  it('une con punto y coma, pasa de campo sin partir un dato y omite lo que no cabe', () => {
    const d = (etiqueta: string, largo: number) => ({ etiqueta, valor: 'x'.repeat(largo) });
    const r = componerDatosBien([d('A', 10), d('B', 10), d('C', 10), d('D', 26), d('E', 1)], 30);
    expect(r.xdescrip3).toBe(`A: ${'x'.repeat(10)}; B: ${'x'.repeat(10)}`);
    expect(r.xdescrip4).toBe(`C: ${'x'.repeat(10)}; E: x`);
    expect(r.omitidos).toEqual(['D']);
  });

  it('un dato mayor que el campo se omite sin perder el espacio de xdescrip3', () => {
    const r = componerDatosBien([{ etiqueta: 'L', valor: 'x'.repeat(300) }, { etiqueta: 'C', valor: 'y' }]);
    expect(r).toEqual({ xdescrip3: 'C: y', xdescrip4: null, omitidos: ['L'] });
  });

  it('normaliza espacios y saltos de línea', () => {
    expect(componerDatosBien([{ etiqueta: ' Serial ', valor: ' AB\n  12 ' }]).xdescrip3).toBe('Serial: AB 12');
  });
});

describe('calcularBiomasa', () => {
  const base: EntradaBiomasa = {
    cantidad_animales: 100, peso_promedio: 200, fecha_inicio: '2026-11-05', horizonte_meses: 6, b0: 20000, precio_kg: 2.5,
    lote: 'LT-2026-001', ihl: '0,92',
  };

  it('ejemplo 3.6: 100 animales a 0,194 con 120 días de verano y 60 de invierno', () => {
    const { biomasa } = calcularBiomasa({ ...base, fecha_inicio: '2027-01-22' }, '2027-07-21');
    expect([biomasa!.dias_verano, biomasa!.dias_invierno]).toEqual([120, 60]);
    expect([biomasa!.engorde_verano, biomasa!.engorde_invierno, biomasa!.engorde_esperado]).toEqual([2328, 1164, 3492]);
    expect(biomasa!.retencion_a).toBe(1164);
    expect(biomasa!.umbral_ciclo).toBeCloseTo(1 / 3, 5);
    // PBI-A del ejemplo con esa retención: 328 kg con observado de 2.000 kg y 2.328 kg con observado cero.
    expect(3492 - 2000 - biomasa!.retencion_a).toBe(328);
    expect(3492 - biomasa!.retencion_a).toBe(2328);
  });

  it('horizonte íntegramente de verano o de invierno: umbral 40 % y 20 % (3.4)', () => {
    expect(calcularBiomasa({ ...base, fecha_inicio: '2026-11-05' }, '2027-01-01').biomasa!.umbral_ciclo).toBe(0.4);
    expect(calcularBiomasa({ ...base, fecha_inicio: '2027-06-01' }, '2027-09-01').biomasa!.umbral_ciclo).toBe(0.2);
  });

  it('20.000 kg a 6 meses desde el 5-nov-2026: todo verano, 181 días y SA0 de 50.000', () => {
    expect(calcularBiomasa(base).biomasa).toMatchObject({
      fecha_cierre: '2027-05-05', dias: 181, dias_verano: 181, dias_invierno: 0, suma_inicial: 50000,
      engorde_verano: 3511.4, engorde_invierno: 0, engorde_esperado: 3511.4, biomasa_esperada: 23511.4,
      retencion_a: 1404.56, umbral_ciclo: 0.4,
    });
  });

  it('frontera de estación: 21-may verano, 22-may invierno, 7-oct invierno y 8-oct verano', () => {
    const dias = (ini: string, fin: string) => {
      const b = calcularBiomasa({ ...base, fecha_inicio: ini }, fin).biomasa!;
      return [b.dias_verano, b.dias_invierno];
    };
    expect(dias('2027-05-21', '2027-05-22')).toEqual([1, 0]);
    expect(dias('2027-05-22', '2027-05-23')).toEqual([0, 1]);
    expect(dias('2027-10-07', '2027-10-08')).toEqual([0, 1]);
    expect(dias('2027-10-08', '2027-10-09')).toEqual([1, 0]);
  });

  it('el bisiesto suma un día real y la fecha de cierre no se cuenta', () => {
    expect(calcularBiomasa({ ...base, fecha_inicio: '2027-11-05' }).biomasa!.dias).toBe(182);
    expect(calcularBiomasa({ ...base, fecha_inicio: '2027-11-05', horizonte_meses: 12 }).biomasa!.dias).toBe(366);
  });

  it('cada bloque toma el escalón del promedio proyectado, no el orden del semestre (Anexo I)', () => {
    const { biomasa } = calcularBiomasa({ ...base, horizonte_meses: 24 });
    expect(biomasa!.bloques.map((b) => [b.peso_promedio_inicio, b.gdbce])).toEqual([
      [200, 0.194], [235.114, 0.237], [278.722, 0.28], [329.682, 0.345],
    ]);
    expect(biomasa!.dias).toBe(731);
  });

  it('el escalón inferior alcanzado incluye el límite exacto', () => {
    const tasa = (peso: number) => calcularBiomasa({ ...base, peso_promedio: peso, b0: peso * 100 }).biomasa!.bloques[0].gdbce;
    expect([tasa(180), tasa(219.99), tasa(220), tasa(259.99), tasa(260), tasa(319.99), tasa(320)]).toEqual([
      0.194, 0.194, 0.237, 0.237, 0.28, 0.28, 0.345,
    ]);
  });

  it('rechaza promedio bajo 180, sobre 350 o que no coincide con B0 / animales', () => {
    expect(calcularBiomasa({ ...base, peso_promedio: 179.99, b0: 17999 }).errores[0]).toContain('asignación expresa');
    expect(calcularBiomasa({ ...base, peso_promedio: 350.01, b0: 35001 }).errores[0]).toContain('tope de ingreso');
    expect(calcularBiomasa({ ...base, b0: 21000 }).errores[0]).toContain('no coincide');
    expect(calcularBiomasa({ ...base, peso_promedio: 350, b0: 35000 }).errores).toEqual([]);
  });

  it('acepta un promedio redondeado a 2 decimales cuando B0 / animales no es exacto', () => {
    expect(calcularBiomasa({ ...base, cantidad_animales: 137, peso_promedio: 200.09, b0: 27412 }).errores).toEqual([]);
  });
});

describe('datosBienBiomasa', () => {
  const entrada: EntradaBiomasa = {
    cantidad_animales: 100, peso_promedio: 200, fecha_inicio: '2026-11-05', horizonte_meses: 6, b0: 20000, precio_kg: 2.5,
    lote: 'LT-2026-001', ihl: '0,92',
  };

  it('imprime los datos pedidos dentro de xdescrip3 y xdescrip4', () => {
    const r = componerDatosBien(datosBienBiomasa(calcularBiomasa(entrada).biomasa!, '$'));
    const texto = `${r.xdescrip3}; ${r.xdescrip4}`;
    for (const parte of [
      'Lote Gan. Cert.: LT-2026-001', 'Ind. Homog. Lote (IHL): 0,92', 'Unid. Computables: 100 animales, prom. 200 kg',
      'Biomasa Aseg. Ini. (B0): 20.000 kg', 'Biomasa Gan. Cert.: 20.000 kg', 'Precio Kg Contr.: $ 2,50',
      'Horizonte Contr.: 6 meses', 'Curva Contr. kg/animal/dia: 0,194', 'Engorde esperado: 3.511,4 kg',
      'Biomasa esperada: 23.511,4 kg', 'Deducible engorde: 40% Gv 3.511,4 + 20% Gi 0 = 1.404,56 kg',
    ]) expect(texto).toContain(parte);
    expect(r.omitidos).toEqual([]);
  });

  it('un lote grande a 24 meses cabe completo en los 500 caracteres', () => {
    const grande: EntradaBiomasa = {
      ...entrada, cantidad_animales: 5000, peso_promedio: 200.09, b0: 1000450, horizonte_meses: 24, fecha_inicio: '2027-02-01',
      lote: 'L'.repeat(30), ihl: 'I'.repeat(20),
    };
    const r = componerDatosBien(datosBienBiomasa(calcularBiomasa(grande).biomasa!, '$'));
    expect(r.omitidos).toEqual([]);
    expect(r.xdescrip3!.length).toBeLessThanOrEqual(250);
    expect(r.xdescrip4!.length).toBeLessThanOrEqual(250);
  });

  it('con cifras extremas solo se pierde la biomasa esperada, y se informa', () => {
    const extremo: EntradaBiomasa = {
      ...entrada, cantidad_animales: 1000000, peso_promedio: 349.9999, b0: 349999900, precio_kg: 99999.99, horizonte_meses: 24,
      lote: 'L'.repeat(30), ihl: 'I'.repeat(20),
    };
    const r = componerDatosBien(datosBienBiomasa(calcularBiomasa(extremo).biomasa!, '$'));
    expect(r.omitidos).toEqual(['Biomasa esperada']);
    expect(r.xdescrip4).toContain('Deducible engorde');
  });
});

describe('normalizarLote y patronLote', () => {
  it('normaliza espacios y mayúsculas', () => {
    expect(normalizarLote('  lt  -1 \n')).toBe('LT -1');
    expect(normalizarLote(undefined)).toBe('');
  });

  it('escapa los comodines y su propio escape, anclado y con el ; final', () => {
    expect(patronLote('lt-1')).toBe('LOTE GAN. CERT.: LT-1;%');
    expect(patronLote('A_B%C[D]!')).toBe('LOTE GAN. CERT.: A!_B!%C![D]!!;%');
  });
});

describe('numeroVe', () => {
  it('agrupa miles con punto, usa coma decimal y quita ceros', () => {
    expect([numeroVe(20000), numeroVe(3511.4), numeroVe(2.5, 2, true), numeroVe(0.28, 3, true), numeroVe(1404.56)]).toEqual([
      '20.000', '3.511,4', '2,50', '0,280', '1.404,56',
    ]);
  });
});

describe('RiesgosGeneralesService (datos del bien)', () => {
  const fila = {
    cplan: 'PAS06', xplan: 'PASTORA', cmoneda: '$', ccober: '901', ctarifa: '1', xcobertura: 'ENGORDE', msumaplan: 0,
    bobligatoria: 'T', pprima: 1.666667, msumamin: 0, msumamax: 0, pcomision: 10, ptasamon: 1, cnrecibo: '25-1',
    iestado: 'V', qtarifa: 1, qdetalle: 1, qramo: 1,
    cnpoliza: '25-1-1100016178', cpoliza: '1',
  };

  /** LIKE de SQL Server con ESCAPE '!' sobre un texto ya en mayúsculas. */
  const like = (texto: string, patron: string) => {
    const lit = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = [...patron.matchAll(/!(.)|./gs)].map(([m, esc]) => (esc ? lit(esc) : m === '%' ? '.*' : m === '_' ? '.' : lit(m))).join('');
    return new RegExp(`^${re}$`, 's').test(texto);
  };

  /** `xdescrip3`: pólizas vigentes del ramo 25 en rgcerti; `errorLote`: la consulta del lote falla. */
  function crear({ xdescrip3 = [] as string[], errorLote = false } = {}) {
    const inputs: Record<string, unknown> = {};
    const sql: string[] = [];
    const execute = jest.fn(async () => ({ recordset: [fila] }));
    const req = {
      input(k: string, ...v: unknown[]) { inputs[k] = v[v.length - 1]; return req; },
      query: async (texto: string) => {
        if (!texto.includes('rgcerti')) return { recordset: [fila] };
        sql.push(texto);
        if (errorLote) throw new Error('timeout');
        const hit = xdescrip3.find((x) => like(x.trim().toUpperCase(), String(inputs.patron)));
        return { recordset: hit ? [{ cnpoliza: '25-1-1100016190   ' }] : [] };
      },
      execute,
    };
    const T: any = new Proxy(function () {}, { get: () => T, apply: () => T });
    const db = { types: T, request: () => req };
    const config = { get: () => 'http://pdf' };
    return { inputs, sql, execute, service: new RiesgosGeneralesService(db as never, config as never) };
  }

  const persona = { tipo_cedula: 'V', rif: '12345678', nombre: 'JUAN' };
  const actual = {
    cramo: 25, cplan: 'PAS06', coberturas: [{ ccober: '901' }], calculo: { unidades: 20000, valor_unidad: 2.5 },
    tomador: persona, bien: 'Lote', direccion_riesgo: 'Finca La Pastora', meses: 6,
  };
  const biomasa = {
    cantidad_animales: 100, peso_promedio: 200, fecha_inicio: '2026-11-05', horizonte_meses: 6, lote: 'LT-1', ihl: '0,92',
  };
  const mesesDesdeHoy = (m: number) => sumarMeses(new Date(), m).toISOString().split('T')[0];

  it('un payload actual responde igual y deja xdescrip3 y xdescrip4 en null', async () => {
    const { service, inputs } = crear();
    const r = await service.emitir(actual);
    expect(Object.keys(r.cotizacion).sort()).toEqual(['coberturas', 'comision_total', 'prima_total', 'suma_asegurada']);
    expect([inputs.xdescrip1, inputs.xdescrip2, inputs.xdescrip3, inputs.xdescrip4]).toEqual(['Lote', 'Finca La Pastora', null, null]);
  });

  it('sin meses ni bloques, la vigencia sigue siendo de 1 año', async () => {
    const { service, inputs } = crear();
    const { meses: _sin, ...sinMeses } = actual;
    await service.emitir(sinMeses);
    expect(inputs.fhasta).toBe(mesesDesdeHoy(12));
  });

  it('datos_bien genérico llega a xdescrip3 en cualquier ramo admitido', async () => {
    const { service, inputs } = crear();
    const r = await service.emitir({ ...actual, cramo: 38, apartamento: 1, datos_bien: [{ etiqueta: 'Serial', valor: 'AB-1' }] });
    expect(inputs.xdescrip3).toBe('Serial: AB-1');
    expect(inputs.xdescrip4).toBeNull();
    expect(r.cotizacion.biomasa).toBeUndefined();
  });

  it('biomasa: cotiza y emite con xdescrip3 y xdescrip4 y la vigencia del horizonte', async () => {
    const { service, inputs } = crear();
    const { meses: _sin, ...sinMeses } = actual;
    const r = await service.emitir({
      ...sinMeses, biomasa: { ...biomasa, horizonte_meses: 12 }, datos_bien: [{ etiqueta: 'Finca', valor: 'La Pastora' }],
    });
    expect(r.cotizacion.biomasa!.b0).toBe(20000);
    expect(r.cotizacion.biomasa!.bloques).toHaveLength(2);
    expect(inputs.fhasta).toBe(mesesDesdeHoy(12));
    expect(inputs.xdescrip3).toContain('Lote Gan. Cert.: LT-1');
    expect(inputs.xdescrip4).toContain('Finca: La Pastora');
    expect(r.cotizacion.datos_bien!.omitidos).toEqual([]);
  });

  it('cotizar con biomasa no exige lote ni IHL; emitir sí', async () => {
    const { lote: _l, ihl: _i, ...sinLote } = biomasa;
    const { service } = crear();
    const c = await service.cotizar({ ...actual, biomasa: sinLote });
    expect(c.biomasa!.engorde_esperado).toBe(3511.4);
    await expect(service.emitir({ ...actual, biomasa: sinLote })).rejects.toThrow('lote e ihl');
  });

  describe('un lote, una póliza vigente', () => {
    const emision = { ...actual, biomasa };
    const texto = (lote: string) => `Lote Gan. Cert.: ${lote}; Ind. Homog. Lote (IHL): 0,92; Unid. Computables: 100 animales`;

    it('rechaza con 409 el mismo lote y no llama al SP, aunque cambien tomador, asegurado y plan', async () => {
      const { service, execute } = crear({ xdescrip3: [texto('LT-1')] });
      const otro = { ...persona, rif: '99999999', nombre: 'PEDRO' };
      const err = await service.emitir({ ...emision, cplan: 'PAS12', tomador: otro, asegurado: otro }).catch((e) => e);
      expect(err.getStatus()).toBe(409);
      expect(err.message).toContain('LT-1');
      expect(err.message).toContain('25-1-1100016190');
      expect(execute).not.toHaveBeenCalled();
    });

    it('normaliza mayúsculas y espacios, y graba la forma normalizada', async () => {
      const dup = crear({ xdescrip3: [texto('LT-1')] });
      await expect(dup.service.emitir({ ...emision, biomasa: { ...biomasa, lote: '  lt-1 ' } })).rejects.toThrow('ya está asegurado');
      const viejo = crear({ xdescrip3: [texto('lt-1')] });
      await expect(viejo.service.emitir(emision)).rejects.toThrow('ya está asegurado');
      const { service, inputs } = crear();
      await service.emitir({ ...emision, biomasa: { ...biomasa, lote: ' lt-7 ' } });
      expect(String(inputs.xdescrip3).startsWith('Lote Gan. Cert.: LT-7; ')).toBe(true);
    });

    it('coincide exacto: LT-1 no choca con LT-10, ni con el texto dentro de otro dato', async () => {
      const { service, execute } = crear({ xdescrip3: [texto('LT-10'), texto('XLT-1'), `Serial: ${texto('LT-1')}`] });
      await service.emitir(emision);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('los comodines del lote son literales y van por parámetro', async () => {
      const { service, execute, inputs, sql } = crear({ xdescrip3: [texto('LTX1'), texto('LT-ABC')] });
      await service.emitir({ ...emision, biomasa: { ...biomasa, lote: 'LT_1' } });
      await service.emitir({ ...emision, biomasa: { ...biomasa, lote: 'LT-%' } });
      expect(execute).toHaveBeenCalledTimes(2);
      expect(inputs.patron).toBe('LOTE GAN. CERT.: LT-!%;%');
      expect(sql[0]).toContain("LIKE @patron ESCAPE '!'");
      expect(sql[0]).not.toContain('LT-');
    });

    it('la consulta mira el ramo y la vigencia, no al tomador ni el plan', async () => {
      const { service, sql, inputs } = crear();
      await service.emitir(emision);
      expect(sql[0]).toContain("p.iestado = 'V' AND p.fhasta > @fdesde");
      expect(sql[0]).not.toMatch(/casegurado|ctenedor|cplan/);
      expect(inputs.cramo).toBe(25);
      expect(inputs.fdesde).toBe(inputs.femision);
    });

    it('sin biomasa no consulta el lote', async () => {
      const { service, sql } = crear({ xdescrip3: [texto('LT-1')] });
      await service.emitir(actual);
      await service.emitir({ ...actual, cramo: 38, apartamento: 1 });
      expect(sql).toEqual([]);
    });

    it('si la consulta falla al emitir, no emite', async () => {
      const { service, execute } = crear({ errorLote: true });
      await expect(service.emitir(emision)).rejects.toThrow('timeout');
      expect(execute).not.toHaveBeenCalled();
    });

    it('cotizar no rechaza: avisa sin revelar la póliza, y sin aviso si está libre o la consulta falla', async () => {
      const dup = await crear({ xdescrip3: [texto('LT-1')] }).service.cotizar(emision);
      expect(dup.aviso_lote).toContain('LT-1');
      expect(dup.aviso_lote).not.toContain('25-1-');
      expect((await crear().service.cotizar(emision)).aviso_lote).toBeUndefined();
      expect((await crear({ errorLote: true }).service.cotizar(emision)).aviso_lote).toBeUndefined();
    });
  });

  it('rechaza biomasa fuera del ramo 25, sin calculo o con meses distinto al horizonte', async () => {
    const { service } = crear();
    await expect(service.cotizar({ ...actual, cramo: 38, biomasa })).rejects.toThrow('no admite');
    await expect(service.cotizar({ ...actual, calculo: undefined, coberturas: [{ ccober: '901', suma: 50000 }], biomasa })).rejects.toThrow('requiere calculo');
    await expect(service.emitir({ ...actual, meses: 12, biomasa })).rejects.toThrow('no coincide');
  });
});

describe('BiomasaDto y DatoBienDto', () => {
  const v = (dto: new () => object, datos: object) => validate(plainToInstance(dto, datos)).then((e) => e.map((x) => x.property));
  const ok = { cantidad_animales: 100, peso_promedio: 200, fecha_inicio: '2026-11-05', horizonte_meses: 6 };

  it('acepta lote e IHL opcionales', async () => {
    expect(await v(BiomasaDto, ok)).toEqual([]);
  });

  it('rechaza punto y coma en el lote', async () => {
    expect(await v(BiomasaDto, { ...ok, lote: 'LT;1' })).toEqual(['lote']);
    expect(await v(BiomasaDto, { ...ok, lote: 'LT-1' })).toEqual([]);
  });

  it('rechaza horizonte, fecha y cantidad inválidos', async () => {
    expect(await v(BiomasaDto, { ...ok, horizonte_meses: 7 })).toEqual(['horizonte_meses']);
    expect(await v(BiomasaDto, { ...ok, fecha_inicio: '2026-02-30' })).toEqual(['fecha_inicio']);
    expect(await v(BiomasaDto, { ...ok, fecha_inicio: '05/11/2026' })).toEqual(['fecha_inicio']);
    expect(await v(BiomasaDto, { ...ok, cantidad_animales: 1.5 })).toEqual(['cantidad_animales']);
  });

  it('rechaza etiqueta o valor en blanco', async () => {
    expect(await v(DatoBienDto, { etiqueta: '  ', valor: 'x' })).toEqual(['etiqueta']);
    expect(await v(DatoBienDto, { etiqueta: 'x', valor: '' })).toEqual(['valor']);
  });
});
