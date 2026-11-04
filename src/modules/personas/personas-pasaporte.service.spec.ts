import { BadRequestException } from '@nestjs/common';
import { PersonasService } from './personas.service';

/**
 * Pasaporte alfanumérico (titular/tomador): cid = 'P-EM2849387' en maclient.cid y cci_rif = 2849387.
 * db mockeado: maclient (query) devuelve `maclientRows`; los SP se registran en `calls`.
 */
function crearServicio(maclientRows: { cci_rif: number; cid: string }[]) {
  const calls: { sp: string; inputs: Record<string, unknown> }[] = [];
  const queries: Record<string, unknown>[] = [];
  const db = {
    types: new Proxy({}, { get: () => (..._a: unknown[]) => 'T' }) as never,
    request: () => {
      const inputs: Record<string, unknown> = {};
      return {
        input: (k: string, _t: unknown, v: unknown) => {
          inputs[k] = v;
        },
        query: async () => {
          queries.push({ ...inputs });
          return { recordset: maclientRows };
        },
        execute: async (sp: string) => {
          calls.push({ sp, inputs: { ...inputs } });
          if (sp === 'sp_create_maclient_nexus') {
            maclientRows = [{ cci_rif: Number(inputs['cci_rif']), cid: String(inputs['cid']) }];
          }
          return { recordset: [{ cnpoliza: '9-1-1', cnrecibo: '1', cpoliza: 1, fanopol: 2026, fmespol: 11 }] };
        },
      };
    },
  };
  const config = { get: (_k: string, d?: unknown) => d };
  const svc = new PersonasService(db as never, config as never, {} as never);
  return { svc, calls, queries };
}

const body = {
  cramo: 9,
  plan: 'FUNBAS',
  fecha_emision: '2026-11-03',
  frecuencia: 'M',
  prima: 10,
  tipo_cedula_tomador: 'P',
  rif_tomador: 2849387,
  cid_tomador: 'P-EM2849387',
  nombre_tomador: 'ZHIZHONG',
  apellido_tomador: 'HUANG',
  sexo_tomador: 'M',
  fnac_tomador: '1988-02-24',
  estado_tomador: 1,
  ciudad_tomador: 1,
  direccion_tomador: 'Caracas',
  telefono_tomador: '0414-1234567',
  correo_tomador: 'a@b.com',
  tipo_cedula_titular: 'P',
  rif_titular: 2849387,
  cid_titular: 'p-em2849387',
  nombre_titular: 'ZHIZHONG',
  apellido_titular: 'HUANG',
  sexo_titular: 'M',
  fnac_titular: '1988-02-24',
  estado_titular: 1,
  ciudad_titular: 1,
  direccion_titular: 'Caracas',
  telefono_titular: '04141234567',
  correo_titular: 'a@b.com',
  asegurados: [{ icedula_asegurado: 'P', xrif_asegurado: 'EM2849387', nparentesco_asegurado: 1 }],
  beneficiarios: [],
};

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

describe('Pasaporte alfanumérico — emisión de personas', () => {
  it('sin choque → crea el cliente (cid completo, cci_rif dígitos) y luego emite', async () => {
    const { svc, calls } = crearServicio([]);
    await svc.createEmissionPerson('key', clone(body) as never).catch(() => undefined);
    const sps = calls.map((c) => c.sp);
    const iCrear = sps.indexOf('sp_create_maclient_nexus');
    expect(iCrear).toBeGreaterThan(-1);
    // Titular y tomador con el mismo pasaporte: un solo alta.
    expect(sps.filter((s) => s === 'sp_create_maclient_nexus')).toHaveLength(1);
    const crear = calls[iCrear].inputs;
    expect(crear).toMatchObject({ icedula: 'P', cci_rif: 2849387, cid: 'P-EM2849387', xnombre: 'ZHIZHONG' });
    const pre = calls.findIndex((c) => 'xrif_titular' in c.inputs && 'asegurados' in c.inputs);
    expect(pre).toBeGreaterThan(iCrear);
    expect(calls[pre].inputs).toMatchObject({ icedula_titular: 'P', xrif_titular: 2849387, xrif_tomador: 2849387 });
    expect(JSON.parse(String(calls[pre].inputs['asegurados']))[0].rif_asegurado).toBe(2849387);
  });

  it('cliente con el mismo cid → OK', async () => {
    const { svc } = crearServicio([{ cci_rif: 2849387, cid: 'P-EM2849387' }]);
    await expect(svc.assertPasaporteSinChoque('P-EM2849387', 2849387)).resolves.toBeUndefined();
  });

  it('cci_rif existente con cid V-… → 400', async () => {
    const { svc } = crearServicio([{ cci_rif: 2849387, cid: 'V-2849387' }]);
    await expect(svc.assertPasaporteSinChoque('P-EM2849387', 2849387)).rejects.toThrow(
      /ya está registrada a otro cliente/,
    );
  });

  it('validación (antes de pagar) revisa el choque', async () => {
    const { svc } = crearServicio([{ cci_rif: 2849387, cid: 'V-2849387' }]);
    await expect(
      svc.validateEmissionPerson({ cramo: 9, plan: 'FUNBAS', rif_titular: 2849387, tipo_cedula_titular: 'P', cid_titular: 'P-EM2849387' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('menos de 5 dígitos → 400', async () => {
    const { svc, calls } = crearServicio([]);
    await expect(
      svc.createEmissionPerson('key', { ...clone(body), cid_titular: 'P-EMX1234', cid_tomador: undefined } as never),
    ).rejects.toThrow(/entre 5 y 9 dígitos/);
    expect(calls.some((c) => c.sp === 'sp_create_maclient_nexus')).toBe(false);
  });

  it('asegurado adicional con letras → 400', async () => {
    const { svc, calls } = crearServicio([]);
    const b = clone(body);
    b.asegurados.push({ icedula_asegurado: 'P', xrif_asegurado: 'AB123456', nparentesco_asegurado: 3 });
    await expect(svc.createEmissionPerson('key', b as never)).rejects.toThrow(/asegurados\[1\]/);
    expect(calls.some((c) => c.sp === 'sp_create_maclient_nexus')).toBe(false);
  });
});
