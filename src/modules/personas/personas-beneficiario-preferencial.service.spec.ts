import { BadRequestException } from '@nestjs/common';
import { PersonasService } from './personas.service';

/**
 * [benef-juridico 16-nov-2026] Vida: beneficiario preferencial jurídico (p. ej. un banco).
 * db mockeado: los SP se registran en `calls` y las consultas en `queries` (sql + inputs).
 */
function crearServicio(maclientRows: { cid: string }[] = []) {
  const calls: { sp: string; inputs: Record<string, unknown> }[] = [];
  const queries: { sql: string; inputs: Record<string, unknown> }[] = [];
  const db = {
    types: new Proxy({}, { get: () => (..._a: unknown[]) => 'T' }) as never,
    request: () => {
      const inputs: Record<string, unknown> = {};
      return {
        input: (k: string, _t: unknown, v: unknown) => {
          inputs[k] = v;
        },
        query: async (sql: string) => {
          queries.push({ sql, inputs: { ...inputs } });
          return { recordset: /FROM maclient/i.test(sql) ? maclientRows : [], rowsAffected: [1] };
        },
        execute: async (sp: string) => {
          calls.push({ sp, inputs: { ...inputs } });
          return { recordset: [{ cnpoliza: '1-1-1', cnrecibo: '1', cpoliza: 1, fanopol: 2026, fmespol: 11 }] };
        },
      };
    },
  };
  const config = { get: (_k: string, d?: unknown) => d };
  const svc = new PersonasService(db as never, config as never, {} as never);
  return { svc, calls, queries };
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
  beneficiario_preferencial: {
    tipo_cedula: 'J',
    rif: 123456789,
    nombre: 'BANCO EJEMPLO, C.A.',
    telefono: '02121234567',
    correo: 'contacto@banco.com',
    estado: 1,
    ciudad: 1,
    direccion: 'Av. Principal',
  },
};

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

describe('Beneficiario preferencial jurídico — emisión de personas', () => {
  it('crea el cliente J antes del SP y lo deja como cbeneficiario de póliza y recibo', async () => {
    const { svc, calls, queries } = crearServicio();
    const res = await svc.createEmissionPerson('key', clone(body) as never);
    expect(res.cnpoliza).toBe('1-1-1');

    const iCrear = calls.findIndex((c) => c.sp === 'sp_create_maclient_nexus');
    expect(iCrear).toBeGreaterThan(-1);
    expect(calls[iCrear].inputs).toMatchObject({
      icedula: 'J',
      cci_rif: 123456789,
      xnombre: 'BANCO EJEMPLO, C.A.',
      xcliente: 'BANCO EJEMPLO, C.A.',
      xapellido: null,
      isexo: null,
      iestado_civil: null,
      fnac: null,
      cid: 'J-12345678-9',
    });
    const iPre = calls.findIndex((c) => 'xrif_titular' in c.inputs && 'beneficiarios' in c.inputs);
    expect(iPre).toBeGreaterThan(iCrear);
    // Beneficiarios por fallecimiento: el preferencial no entra al JSON de BENF (pebenefi).
    const bens = JSON.parse(String(calls[iPre].inputs['beneficiarios']));
    expect(bens.map((x: { rif_beneficiario: number }) => x.rif_beneficiario)).toEqual([7654321]);

    const upd = queries.find((q) => /UPDATE adpoliza SET cbeneficiario/i.test(q.sql));
    expect(upd?.inputs).toMatchObject({ cnpoliza: '1-1-1', fanopol: 2026, fmespol: 11, cbeneficiario: 123456789 });
    expect(upd?.sql).toMatch(/UPDATE adrecibos SET cbeneficiario/i);
  });

  it('sin preferencial no toca cbeneficiario', async () => {
    const { svc, calls, queries } = crearServicio();
    const sinPref = clone(body) as Record<string, unknown>;
    delete sinPref['beneficiario_preferencial'];
    await svc.createEmissionPerson('key', sinPref as never);
    expect(calls.some((c) => c.sp === 'sp_create_maclient_nexus')).toBe(false);
    expect(queries.some((q) => /SET cbeneficiario/i.test(q.sql))).toBe(false);
  });

  it('RIF ya registrado con otra letra → 400 antes de emitir', async () => {
    const { svc, calls } = crearServicio([{ cid: 'V-123456789' }]);
    await expect(svc.createEmissionPerson('key', clone(body) as never)).rejects.toThrow(/V-123456789/);
    expect(calls.filter((c) => c.sp === 'sp_create_maclient_nexus' || 'beneficiarios' in c.inputs)).toHaveLength(0);
  });

  it('beneficiario de la lista J (Socio, 100%): cliente J-40084902-0 antes del SP y BENF sin apellido/sexo/fnac', async () => {
    const { svc, calls } = crearServicio();
    const b = clone(body) as Record<string, unknown>;
    delete b['beneficiario_preferencial'];
    b['beneficiarios'] = [
      {
        icedula_beneficiario: 'J',
        xrif_beneficiario: 400849020,
        xnombre_beneficiario: 'ARCA FINANCE C.A.',
        xapellido_beneficiario: 'X',
        isexo_beneficiario: 'M',
        fnac_beneficiario: '2000-01-01',
        nparentesco_beneficiario: 9,
        pporce_beneficiario: 100,
      },
    ];
    await svc.createEmissionPerson('key', b as never);
    const iCrear = calls.findIndex((c) => c.sp === 'sp_create_maclient_nexus');
    expect(calls[iCrear].inputs).toMatchObject({
      icedula: 'J',
      cci_rif: 400849020,
      cid: 'J-40084902-0',
      xnombre: 'ARCA FINANCE C.A.',
      xcliente: 'ARCA FINANCE C.A.',
      xapellido: null,
      isexo: null,
      fnac: null,
    });
    const iPre = calls.findIndex((c) => 'xrif_titular' in c.inputs && 'beneficiarios' in c.inputs);
    expect(iPre).toBeGreaterThan(iCrear);
    expect(JSON.parse(String(calls[iPre].inputs['beneficiarios']))[0]).toMatchObject({
      tipo_cedula_beneficiario: 'J',
      rif_beneficiario: 400849020,
      nombre_beneficiario: 'ARCA FINANCE C.A.',
      apellido_beneficiario: '',
      sexo_beneficiario: null,
      estado_civil_beneficiario: null,
      fnac_beneficiario: null,
      nparentesco_beneficiario: 9,
      pporce_beneficiario: 100,
    });
  });

  it('beneficiario de la lista J con 8 dígitos → 400 antes de emitir', async () => {
    const { svc, calls } = crearServicio();
    const b = clone(body);
    b.beneficiarios[0].icedula_beneficiario = 'J';
    b.beneficiarios[0].xrif_beneficiario = '40084902' as never; // texto: el número se completa con ceros (Emisión ya exige 9)
    await expect(svc.createEmissionPerson('key', b as never)).rejects.toThrow(/9 dígitos/);
    expect(calls.filter((c) => c.sp === 'sp_create_maclient_nexus' || 'beneficiarios' in c.inputs)).toHaveLength(0);
  });

  it('titular J → 400', async () => {
    const { svc } = crearServicio();
    const b = clone(body) as Record<string, unknown>;
    b['tipo_cedula_titular'] = 'J';
    await expect(svc.createEmissionPerson('key', b as never)).rejects.toThrow(/titular/);
  });
});
