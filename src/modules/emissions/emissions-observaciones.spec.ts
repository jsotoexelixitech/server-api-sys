import { BadRequestException } from '@nestjs/common';
import { EmissionsService } from './emissions.service';

/**
 * [observaciones 17-nov-2026] Emisión RCV con `observaciones` (alias `xobserva`) →
 * sp_poliza_observacion_nexus tras emitir (adpoliza.xobserva). No bloqueante.
 * db mockeada; los pasos post-emisión ajenos a esto se stubean.
 */
const SP_OBS = 'sp_poliza_observacion_nexus';
const SP_PRE = 'sp_pre_emision_automovil_rcv_nexus';
const plan = { cnpoliza: '18-1-0130481059', cnrecibo: '18-100284519', fanopol: 2026, fmespol: 11 };
const rcv = { cnpoliza: '26-1-0130481060', cnrecibo: '26-100284524', fanopol: 2026, fmespol: 11 };

function crearServicio(opts: { obs?: 'ok' | 'no-existe'; rcvAparte?: boolean } = {}) {
  const calls: { sp: string; inputs: Record<string, unknown> }[] = [];
  const db = {
    types: new Proxy({}, { get: () => (..._a: unknown[]) => 'T' }) as never,
    request: () => {
      const inputs: Record<string, unknown> = {};
      return {
        input: (k: string, _t: unknown, v: unknown) => {
          inputs[k] = v;
        },
        output: () => undefined,
        query: async () => ({ recordset: [], rowsAffected: [0] }),
        execute: async (sp: string) => {
          calls.push({ sp, inputs: { ...inputs } });
          if (sp === SP_OBS) {
            if (opts.obs === 'no-existe') {
              throw new Error(`Could not find stored procedure '${SP_OBS}'.`);
            }
            return { recordset: [{ filas_actualizadas: 1 }] };
          }
          if (sp === SP_PRE) {
            return { recordsets: opts.rcvAparte ? [[plan], [rcv]] : [[plan]] };
          }
          return { recordset: [], output: {} };
        },
      };
    },
  };
  const config = { get: (k: string, d?: unknown) => (k === 'EMISSION_SOURCE' ? 'local' : d) };
  const svc = new EmissionsService(db as never, config as never, {} as never);
  const s = svc as unknown as Record<string, unknown>;
  // Pasos ajenos a observaciones (consultas de prima, Arys, tarjeta, repair).
  s.resolveMarketplaceEntity = async () => undefined;
  s.resolveMprimaForSp = async () => ({ mprima: 10, cmoneda: 2 });
  s.resolveClubArysPdfForEmission = async () => '';
  s.lookupPolicyTarjetaKeys = async () => ({});
  s.repairRcvCoberturasIfEmpty = async () => undefined;
  s.scheduleArysMembershipRegistration = () => undefined;
  s.buildPolizaRcvAparte = async (row: Record<string, unknown>) => ({ cnpoliza: row['cnpoliza'] });
  return { svc, calls };
}

const body = {
  cramo: 18,
  plan: 'RCVBAS',
  fecha_emision: '2026-11-17',
  tipo_cedula_tomador: 'V',
  rif_tomador: 12345678,
  nombre_tomador: 'ANA',
  apellido_tomador: 'PEREZ',
  fnac_tomador: '1990-05-01',
  estado_tomador: 1,
  ciudad_tomador: 1,
  direccion_tomador: 'Caracas',
  tipo_cedula_titular: 'V',
  rif_titular: 12345678,
  fnac_titular: '1990-05-01',
  xplaca: 'AB123CD',
  cmarca: 'TOYOTA',
  cmodelo: 'COROLLA',
  cversion: 'XLI',
  cano: 2020,
};

const obsCalls = (calls: { sp: string; inputs: Record<string, unknown> }[]) =>
  calls.filter((c) => c.sp === SP_OBS);

describe('Observaciones — emisión RCV', () => {
  it('con observaciones llama al SP tras emitir con el texto recortado', async () => {
    const { svc, calls } = crearServicio();
    const res = await svc.createEmissionAuto('key', { ...body, observaciones: '  Rayón\tpuerta trasera  ' });
    expect(res.cnpoliza).toBe(plan.cnpoliza);
    expect(res).toMatchObject({ observaciones: { guardada: true } });
    expect(obsCalls(calls)).toEqual([
      {
        sp: SP_OBS,
        inputs: {
          cnpoliza: plan.cnpoliza,
          xobserva: 'Rayón puerta trasera',
          cusuario: null,
          ifuente: 'NEXUS_API',
          xorigen: 'emision_rcv',
          xcanal: null,
          xapikey_id: null,
        },
      },
    ]);
    expect(calls.findIndex((c) => c.sp === SP_OBS)).toBeGreaterThan(calls.findIndex((c) => c.sp === SP_PRE));
  });

  it('acepta el alias xobserva', async () => {
    const { svc, calls } = crearServicio();
    await svc.createEmissionAuto('key', { ...body, xobserva: 'Nota' });
    expect(obsCalls(calls).map((c) => c.inputs['xobserva'])).toEqual(['Nota']);
  });

  it('RCV aparte: guarda la observación en ambas pólizas', async () => {
    const { svc, calls } = crearServicio({ rcvAparte: true });
    const res = await svc.createEmissionAuto('key', { ...body, observaciones: 'Nota' });
    expect(obsCalls(calls).map((c) => c.inputs['cnpoliza'])).toEqual([plan.cnpoliza, rcv.cnpoliza]);
    expect(res).toMatchObject({ observaciones: { guardada: true } });
  });

  it('sin observaciones no llama al SP ni cambia la respuesta', async () => {
    const { svc, calls } = crearServicio();
    const res = await svc.createEmissionAuto('key', { ...body });
    expect(res).not.toHaveProperty('observaciones');
    expect(obsCalls(calls)).toHaveLength(0);
  });

  it('si el SP aún no existe la emisión responde OK con guardada=false', async () => {
    const { svc } = crearServicio({ obs: 'no-existe' });
    const res = await svc.createEmissionAuto('key', { ...body, observaciones: 'Nota' });
    expect(res.cnpoliza).toBe(plan.cnpoliza);
    expect(res).toMatchObject({ observaciones: { guardada: false } });
  });

  it('más de 255 caracteres → 400 sin emitir (igual que el DTO de personas)', async () => {
    const { svc, calls } = crearServicio();
    await expect(
      svc.createEmissionAuto('key', { ...body, observaciones: 'a'.repeat(256) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(calls.some((c) => c.sp === SP_PRE)).toBe(false);
  });
});
