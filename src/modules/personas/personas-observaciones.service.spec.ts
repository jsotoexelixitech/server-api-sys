import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PersonasService } from './personas.service';
import { CreateEmissionPersonDto } from './dto/create-emission-person.dto';

/**
 * [observaciones 17-nov-2026] Emisión de personas con `observaciones` → sp_poliza_observacion_nexus
 * tras emitir (adpoliza.xobserva). No bloqueante: si el SP falla la emisión responde OK igual.
 */
const SP_OBS = 'sp_poliza_observacion_nexus';

function crearServicio(obs: 'ok' | 'no-existe' = 'ok') {
  const calls: { sp: string; inputs: Record<string, unknown> }[] = [];
  const db = {
    types: new Proxy({}, { get: () => (..._a: unknown[]) => 'T' }) as never,
    request: () => {
      const inputs: Record<string, unknown> = {};
      return {
        input: (k: string, _t: unknown, v: unknown) => {
          inputs[k] = v;
        },
        query: async () => ({ recordset: [], rowsAffected: [1] }),
        execute: async (sp: string) => {
          calls.push({ sp, inputs: { ...inputs } });
          if (sp === SP_OBS) {
            if (obs === 'no-existe') {
              throw new Error(`Could not find stored procedure '${SP_OBS}'.`);
            }
            return { recordset: [{ filas_actualizadas: 1 }] };
          }
          return { recordset: [{ cnpoliza: '1-1-1', cnrecibo: '1', cpoliza: 1, fanopol: 2026, fmespol: 11 }] };
        },
      };
    },
  };
  const config = { get: (_k: string, d?: unknown) => d };
  const svc = new PersonasService(db as never, config as never, {} as never);
  return { svc, calls };
}

const body = {
  cramo: 1,
  plan: 'TEMP1A',
  fecha_emision: '2026-11-16',
  frecuencia: 'A',
  prima: 50,
  tipo_cedula_tomador: 'V',
  rif_tomador: 12345678,
  nombre_tomador: 'ANA',
  apellido_tomador: 'PEREZ',
  sexo_tomador: 'F',
  fnac_tomador: '1990-05-01',
  estado_tomador: 1,
  ciudad_tomador: 1,
  direccion_tomador: 'Caracas',
  telefono_tomador: '04141234567',
  correo_tomador: 'a@b.com',
  tipo_cedula_titular: 'V',
  rif_titular: 12345678,
  nombre_titular: 'ANA',
  apellido_titular: 'PEREZ',
  sexo_titular: 'F',
  fnac_titular: '1990-05-01',
  asegurados: [{ icedula_asegurado: 'V', xrif_asegurado: 12345678, nparentesco_asegurado: 1 }],
  beneficiarios: [
    { icedula_beneficiario: 'V', xrif_beneficiario: 7654321, xnombre_beneficiario: 'LUIS', xapellido_beneficiario: 'PEREZ', nparentesco_beneficiario: 3, pporce_beneficiario: 100 },
  ],
};

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

describe('Observaciones — emisión de personas', () => {
  it('con observaciones llama al SP tras emitir con el texto recortado', async () => {
    const { svc, calls } = crearServicio();
    const res = await svc.createEmissionPerson('key', { ...clone(body), observaciones: '  Entregar\npor correo  ' } as never);
    expect(res.cnpoliza).toBe('1-1-1');
    expect(res).toMatchObject({ observaciones: { guardada: true } });
    const obs = calls.filter((c) => c.sp === SP_OBS);
    expect(obs).toHaveLength(1);
    expect(obs[0].inputs).toEqual({ cnpoliza: '1-1-1', xobserva: 'Entregar por correo' });
    // Va después de la emisión.
    expect(calls.findIndex((c) => c.sp === SP_OBS)).toBe(calls.length - 1);
  });

  it('sin observaciones (o en blanco) no llama al SP ni cambia la respuesta', async () => {
    for (const extra of [{}, { observaciones: '   ' }]) {
      const { svc, calls } = crearServicio();
      const res = await svc.createEmissionPerson('key', { ...clone(body), ...extra } as never);
      expect(res.cnpoliza).toBe('1-1-1');
      expect(res).not.toHaveProperty('observaciones');
      expect(calls.some((c) => c.sp === SP_OBS)).toBe(false);
    }
  });

  it('si el SP aún no existe la emisión responde OK con guardada=false', async () => {
    const { svc } = crearServicio('no-existe');
    const res = await svc.createEmissionPerson('key', { ...clone(body), observaciones: 'Nota' } as never);
    expect(res.cnpoliza).toBe('1-1-1');
    expect(res).toMatchObject({ observaciones: { guardada: false } });
  });
});

describe('CreateEmissionPersonDto.observaciones', () => {
  const errores = async (observaciones: unknown) =>
    (await validate(plainToInstance(CreateEmissionPersonDto, { ...body, observaciones }))).filter(
      (e) => e.property === 'observaciones',
    );

  it('opcional y hasta 255 caracteres', async () => {
    expect(await errores(undefined)).toHaveLength(0);
    expect(await errores('a'.repeat(255))).toHaveLength(0);
  });

  it('más de 255 o no texto → error (400 antes de emitir)', async () => {
    expect(await errores('a'.repeat(256))).toHaveLength(1);
    expect(await errores(123)).toHaveLength(1);
  });
});
