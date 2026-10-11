import { InternalServerErrorException } from '@nestjs/common';
import { ClientService } from './client.service';

function crear(salida: { cerror: number; msj: string } | Error) {
  const inputs: Record<string, unknown> = {};
  const db: any = {
    types: { VarChar: (n: number) => ({ n }), Date: 'date', Int: 'int', Bit: 'bit' },
    request: () => ({
      input: (n: string, _t: unknown, v: unknown) => { inputs[n] = v; },
      output: jest.fn(),
      execute: jest.fn(async (sp: string) => {
        inputs.__sp = sp;
        if (salida instanceof Error) throw salida;
        return { output: salida };
      }),
    }),
  };
  return { service: new ClientService(db), inputs };
}
const f = { cnpoliza: '18-1-1130480727', focurrencia: '2026-10-09', fnotificacion: '2026-10-10' };

describe('ClientService.validarSiniestro', () => {
  it('ejecuta SpValidaSiniestro con los datos como parámetros y devuelve válida', async () => {
    const { service, inputs } = crear({ cerror: 0, msj: '' });
    await expect(service.validarSiniestro(f)).resolves.toEqual({ valida: true, motivo: 'OK', mensaje: '' });
    expect(inputs.__sp).toBe('sp_valida_siniestro_nexus');
    expect(inputs).toMatchObject({ cnpoliza: f.cnpoliza, focurrencia: f.focurrencia, fnotificacion: f.fnotificacion });
  });

  it('envía exigir_recibo solo cuando se pide', async () => {
    const a = crear({ cerror: 0, msj: '' });
    await a.service.validarSiniestro(f);
    expect(a.inputs).not.toHaveProperty('exigir_recibo');
    const b = crear({ cerror: 0, msj: '' });
    await b.service.validarSiniestro({ ...f, exigirRecibo: true });
    expect(b.inputs.exigir_recibo).toBe(true);
  });

  it.each([
    ['La póliza no existe o no se encuentra en estado activo.', 'POLIZA_INACTIVA'],
    ['El asegurado no tiene cobertura, debido a que la póliza se encuentra fuera de vigencia.', 'FUERA_DE_VIGENCIA'],
    ['La póliza posee recibos pendiente para la fecha de ocurrencia del siniestro', 'RECIBO_PENDIENTE'],
    ['Otro mensaje desconocido', 'OTRO'],
  ])('clasifica el motivo: %s', async (msj, motivo) => {
    const { service } = crear({ cerror: 1, msj });
    await expect(service.validarSiniestro(f)).resolves.toEqual({ valida: false, motivo, mensaje: msj });
  });

  it('un error de BD responde 500 sin filtrar detalles', async () => {
    const { service } = crear(new Error('Login failed for user x'));
    const err = await service.validarSiniestro(f).catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect(JSON.stringify(err.getResponse())).not.toContain('Login failed');
  });
});
