import { Logger } from '@nestjs/common';
import {
  guardarObservacionPoliza,
  normalizarObservaciones,
  validarObservaciones,
} from './poliza-observacion.helper';

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

  it('llama al SP con la póliza y el texto', async () => {
    const sps: string[] = [];
    const d = db(async (sp) => {
      sps.push(sp);
      return { recordset: [{ filas_actualizadas: 1 }] };
    });
    expect(await guardarObservacionPoliza(d as never, logger, ' 1-1-1 ', 'Nota')).toBe(true);
    expect(sps).toEqual(['sp_poliza_observacion_nexus']);
    expect(d.inputs).toEqual({ cnpoliza: '1-1-1', xobserva: 'Nota' });
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
