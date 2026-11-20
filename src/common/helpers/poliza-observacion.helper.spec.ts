import { Logger } from '@nestjs/common';
import {
  cusuarioAuditoria,
  guardarObservacionPoliza,
  normalizarObservaciones,
  validarObservaciones,
} from './poliza-observacion.helper';
import { nestRequestAuthAls } from '../../modules/auth/nest-request-auth.context';

/** [observaciones 17-nov-2026] Observaciones de la póliza (adpoliza.xobserva) en emisión personas/RCV. */
describe('normalizarObservaciones', () => {
  it('recorta espacios y quita caracteres de control', () => {
    expect(normalizarObservaciones('  Hola\r\n\tmundo\u0000 ')).toBe('Hola mundo');
  });

  it('sin texto devuelve null', () => {
    for (const v of [undefined, null, '', '   ', '\n\t', 5, {}]) {
      expect(normalizarObservaciones(v)).toBeNull();
    }
  });

  it('trunca a 255 caracteres', () => {
    expect(normalizarObservaciones('a'.repeat(300))).toHaveLength(255);
  });
});

describe('validarObservaciones', () => {
  it('acepta ausente o texto de hasta 255', () => {
    expect(validarObservaciones(undefined)).toBeNull();
    expect(validarObservaciones('a'.repeat(255))).toBeNull();
  });

  it('rechaza más de 255 o un valor que no es texto', () => {
    expect(validarObservaciones('a'.repeat(256))).toMatch(/255/);
    expect(validarObservaciones(12)).toMatch(/texto/);
  });
});

describe('guardarObservacionPoliza', () => {
  const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Logger;

  function db(execute: (sp: string) => Promise<unknown>) {
    const inputs: Record<string, unknown> = {};
    return {
      inputs,
      types: new Proxy({}, { get: () => () => 'T' }),
      request: () => ({
        input: (k: string, _t: unknown, v: unknown) => {
          inputs[k] = v;
        },
        execute,
      }),
    };
  }

  it('llama al SP con la póliza, el texto y los datos de auditoría', async () => {
    const sps: string[] = [];
    const d = db(async (sp) => {
      sps.push(sp);
      return { recordset: [{ filas_actualizadas: 1 }] };
    });
    const ok = await nestRequestAuthAls.run(
      { auth: { apikey: 'secreta', apiKeyId: 'k-1', scopes: [], xcanalVenta: 'EMISION', via: 'apikey' } },
      () => guardarObservacionPoliza(d as never, logger, ' 1-1-1 ', 'Nota', { origen: 'emision_rcv', cusuario: '1422' }),
    );
    expect(ok).toBe(true);
    expect(sps).toEqual(['sp_poliza_observacion_nexus']);
    expect(d.inputs).toEqual({
      cnpoliza: '1-1-1',
      xobserva: 'Nota',
      cusuario: 1422,
      ifuente: 'NEXUS_API',
      xorigen: 'emision_rcv',
      xcanal: 'EMISION',
      xapikey_id: 'k-1',
    });
    expect(JSON.stringify(d.inputs)).not.toContain('secreta');
  });

  it('SP de la base sin parámetros de auditoría (8144): guarda con la llamada vieja y avisa', async () => {
    const warn = jest.fn();
    const llamadas: number[] = [];
    const d = db(async () => {
      llamadas.push(Object.keys(d.inputs).length);
      if (llamadas.length === 1) {
        throw Object.assign(new Error('Procedure or function sp_poliza_observacion_nexus has too many arguments specified.'), { number: 8144 });
      }
      return { recordset: [{ filas_actualizadas: 1 }] };
    });
    const ok = await guardarObservacionPoliza(d as never, { log: jest.fn(), warn } as never, '1-1-1', 'Nota', { origen: 'emision_rcv' });
    expect(ok).toBe(true);
    expect(llamadas).toHaveLength(2);
    expect(String(warn.mock.calls[0][0])).toContain('sin auditoría');
  });

  it('otro error no reintenta', async () => {
    let n = 0;
    const d = db(async () => {
      n += 1;
      throw new Error('timeout');
    });
    expect(await guardarObservacionPoliza(d as never, { log: jest.fn(), warn: jest.fn() } as never, '1-1-1', 'Nota')).toBe(false);
    expect(n).toBe(1);
  });

  it('SP inexistente (error 2812): false y warn sin el texto', async () => {
    const warn = jest.fn();
    const d = db(async () => {
      throw new Error("Could not find stored procedure 'sp_poliza_observacion_nexus'.");
    });
    const ok = await guardarObservacionPoliza(d as never, { log: jest.fn(), warn } as never, '1-1-1', 'Texto secreto');
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('largo=13');
    expect(String(warn.mock.calls[0][0])).not.toContain('Texto secreto');
  });

  it('0 filas actualizadas: false', async () => {
    const d = db(async () => ({ recordset: [{ filas_actualizadas: 0 }] }));
    expect(await guardarObservacionPoliza(d as never, logger, '1-1-1', 'Nota')).toBe(false);
  });
});

describe('cusuarioAuditoria', () => {
  it('entero positivo dentro de INT', () => {
    expect(cusuarioAuditoria(7)).toBe(7);
    expect(cusuarioAuditoria(' 1422 ')).toBe(1422);
    expect(cusuarioAuditoria('2147483647')).toBe(2147483647);
  });

  it('fuera de rango, vacío o no numérico → null', () => {
    for (const v of [null, undefined, '', '0', -3, '2147483648', '12a', 'V-123', 1.5]) {
      expect(cusuarioAuditoria(v)).toBeNull();
    }
  });
});
