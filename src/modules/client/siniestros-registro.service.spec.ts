import { BadRequestException, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { RegistrarSiniestroDto } from './dto/registrar-siniestro.dto';
import { SiniestrosRegistroService } from './siniestros-registro.service';

function crear(salida: Record<string, unknown> | Error, cusuario: unknown = 4321) {
  const inputs: Record<string, unknown> = {};
  const db: any = {
    types: {
      VarChar: (n: number) => ({ n }), Char: (n: number) => ({ n }), Numeric: (p: number, s: number) => ({ p, s }),
      Int: 'int', DateTime: 'datetime', Bit: 'bit',
    },
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
  const config: any = { get: () => cusuario };
  return { service: new SiniestrosRegistroService(db, config), inputs };
}

const hoy = new Date().toISOString().slice(0, 10);
const dto = (extra: Partial<RegistrarSiniestroDto> = {}): RegistrarSiniestroDto => ({
  cnpoliza: '18-1-1130480727', placa: 'ab123cd', focurrencia: hoy, ccausa: 18126, ...extra,
});
const ok = { csinies: 1800000000002301, cnsinies: '18-00000002288                ', bexistia: false, cerror: 0, msj: 'Siniestro registrado exitosamente.' };

describe('SiniestrosRegistroService (D14: snsinies es el registro)', () => {
  it('registra y devuelve csinies/cnsinies sin relleno', async () => {
    const { service, inputs } = crear(ok);
    const r = await service.registrar(dto({ monto: 500, tipoPerdida: 'PARCIAL' }));
    expect(r).toEqual({ csinies: '1800000000002301', cnsinies: '18-00000002288', yaExistia: false, mensaje: 'Siniestro registrado exitosamente.' });
    expect(inputs.__sp).toBe('sp_registra_siniestro_nexus');
    expect(inputs).toMatchObject({ cnpoliza: '18-1-1130480727', placa: 'AB123CD', ccausa: 18126, cusuario: 4321, mmonto: 500, ctipoperdida: 2 });
  });

  it.each([['TOTAL', 1], ['PARCIAL', 2], ['DANOS_A_COSAS', 3]] as const)('tipo de pérdida %s = %i (matipoperdida)', async (t, n) => {
    const { service, inputs } = crear(ok);
    await service.registrar(dto({ tipoPerdida: t }));
    expect(inputs.ctipoperdida).toBe(n);
  });

  it('solo envía los opcionales que llegan', async () => {
    const { service, inputs } = crear(ok);
    await service.registrar(dto());
    for (const k of ['mmonto', 'ctipoperdida', 'cpais', 'cestado', 'cciudad', 'xobserva']) expect(inputs).not.toHaveProperty(k);
  });

  it('el usuario de la sesión (o la cédula del cliente) tiene prioridad sobre el de servicio', async () => {
    const a = crear(ok, 4321);
    await a.service.registrar(dto({ cusuario: 15504158 }));
    expect(a.inputs.cusuario).toBe(15504158);
    const b = crear(ok, 4321);
    await b.service.registrar(dto());
    expect(b.inputs.cusuario).toBe(4321);
  });

  it('sin cusuario del solicitante ni de servicio no registra; el 999 tampoco', async () => {
    const a = crear(ok, null);
    await a.service.registrar(dto({ cusuario: 777 })); // el de la sesión basta aunque no haya usuario de servicio
    expect(a.inputs.cusuario).toBe(777);
    const b = crear(ok, null);
    await expect(b.service.registrar(dto())).rejects.toBeInstanceOf(ServiceUnavailableException);
    const c = crear(ok, 4321);
    await expect(c.service.registrar(dto({ cusuario: 999 }))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('la cobertura declarada se envía al SP (la reserva va solo en ella)', async () => {
    const { service, inputs } = crear(ok);
    await service.registrar(dto({ ccobertura: 10 }));
    expect(inputs.ccobertura).toBe(10);
  });

  it('una llamada repetida devuelve el existente', async () => {
    const { service } = crear({ ...ok, bexistia: true, msj: 'El siniestro ya estaba registrado.' });
    await expect(service.registrar(dto())).resolves.toMatchObject({ yaExistia: true, cnsinies: '18-00000002288' });
  });

  it('un rechazo de SIS2000 sale como 400 con su mensaje', async () => {
    const { service } = crear({ cerror: 1, msj: 'El asegurado no tiene cobertura, debido a que la póliza se encuentra fuera de vigencia.' });
    const err = await service.registrar(dto()).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('fuera de vigencia');
  });

  it('un error de BD responde 500 sin filtrar detalles', async () => {
    const { service } = crear(new Error('Login failed for user x'));
    const err = await service.registrar(dto()).catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect(JSON.stringify(err.getResponse())).not.toContain('Login failed');
  });

  it.each([null, 0, 999, 'abc'])('sin SINIESTROS_CUSUARIO válido (%p) no registra: 503', async (u) => {
    const { service, inputs } = crear(ok, u);
    await expect(service.registrar(dto())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(inputs).not.toHaveProperty('__sp');
  });

  it('rechaza fechas incoherentes antes de llamar a SIS2000', async () => {
    const { service, inputs } = crear(ok);
    await expect(service.registrar(dto({ focurrencia: hoy, fnotificacion: '2020-01-01' }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.registrar(dto({ fnotificacion: '2999-01-01' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(inputs).not.toHaveProperty('__sp');
  });
});
