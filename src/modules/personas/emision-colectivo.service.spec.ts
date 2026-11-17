import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as sql from 'mssql';
import { EmisionColectivoService } from './emision-colectivo.service';
import type { CreateEmissionColectivoDto } from './dto/create-emission-colectivo.dto';

const dtoBase = (): CreateEmissionColectivoDto =>
  ({
    cpoliza_plantilla: '328',
    cnpoliza_plantilla: 'C-6-328',
    cramo: 6,
    plan: '1',
    frecuencia: 'M',
    fecha_emision: '2026-11-11',
    fdesde: '2026-11-11',
    fhasta: '2027-11-11',
    cmoneda: 'USD',
    prima: 1200.5,
    tipo_cedula_tomador: 'J',
    rif_tomador: 123456789,
    nombre_tomador: 'EMPRESA EJEMPLO, C.A.',
    titulares: [
      {
        rif_titular: 12345678,
        nombre_titular: 'JOSÉ',
        sexo_titular: 'M',
        fnac_titular: '1985-02-10',
        asegurados: [
          { rif_asegurado: 30111222, nombre_asegurado: 'MARÍA', sexo_asegurado: 'F', fnac_asegurado: '2015-04-20', nparentesco_asegurado: 3 },
        ],
      },
    ],
  }) as CreateEmissionColectivoDto;

function crear(execute: jest.Mock) {
  const inputs: Record<string, unknown> = {};
  type ReqFalso = { input: jest.Mock; output: jest.Mock; execute: jest.Mock };
  const req: ReqFalso = {
    input: jest.fn((name: string, _type: unknown, value: unknown): ReqFalso => {
      inputs[name] = value;
      return req;
    }),
    output: jest.fn((): ReqFalso => req),
    execute,
  };
  const db = { types: sql, request: jest.fn(() => req) };
  const config = {
    get: jest.fn((k: string, d?: unknown) => (k === 'URLPoliza' ? 'https://qaapi.lamundialdeseguros.com/sis2000/poliza/' : d)),
  };
  const channels = { resolveChannel: jest.fn().mockResolvedValue({ cproductor: 80080, ifuente_api: 'API' }) };
  const service = new EmisionColectivoService(db as never, config as never, channels as never);
  return { service, inputs, channels };
}

const SCOPE = ['emissions:colectivo'];

describe('EmisionColectivoService', () => {
  it('exige emissions:colectivo explícito: los comodines no cuentan', async () => {
    const { service } = crear(jest.fn());
    await expect(service.emitir('k', dtoBase(), ['*'])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.emitir('k', dtoBase(), ['emissions:*'])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.emitir('k', dtoBase(), undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('emite y devuelve número, recibo, URL y la prima cotizada', async () => {
    const execute = jest.fn().mockResolvedValue({
      recordsets: [[{ cpoliza: '6000000000000233141', cnpoliza: 'C-6-33141', cnrecibo: '6-1100375627', cproces: 202600309716, fanopol: 2026, fmespol: 11 }]],
      output: { id: 3813 },
    });
    const { service, inputs } = crear(execute);
    const r = await service.emitir('k', dtoBase(), SCOPE);

    expect(execute).toHaveBeenCalledWith('sp_pre_emision_personas_colectivo_nexus');
    expect(inputs['cpoliza_plantilla']).toBe('328');
    expect(inputs['mprimaext']).toBe(1200.5);
    expect(inputs['fdesde']).toEqual(new Date('2026-11-11T00:00:00Z'));
    expect(JSON.parse(String(inputs['titulares']))[0].asegurados).toHaveLength(1);
    expect(r).toMatchObject({
      cnpoliza: 'C-6-33141',
      cnrecibo: '6-1100375627',
      cpoliza: '6000000000000233141',
      urlpoliza: 'https://qaapi.lamundialdeseguros.com/sis2000/poliza/C-6-33141/2026/11/',
      prima: 1200.5,
      titulares: 1,
      asegurados: 2,
    });
  });

  it('rechazo de negocio del SP → 400 con code', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('COLECTIVO_PLAN_NO_VIGENTE: la plantilla C-6-328 no tiene el plan 9 vigente.'));
    const { service } = crear(execute);
    await expect(service.emitir('k', dtoBase(), SCOPE)).rejects.toMatchObject({
      response: { success: false, code: 'COLECTIVO_PLAN_NO_VIGENTE', message: 'la plantilla C-6-328 no tiene el plan 9 vigente.' },
    });
  });

  it('error técnico del SP → 400 sin detalle de SQL', async () => {
    const execute = jest.fn().mockRejectedValue(new Error("Violation of PRIMARY KEY constraint 'PK_pepoltar_ind' in dbo.pepoltar_ind"));
    const { service } = crear(execute);
    const err = await service.emitir('k', dtoBase(), SCOPE).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(err.getResponse())).not.toMatch(/pepoltar|PRIMARY KEY|dbo\./);
  });

  it('nómina con la misma cédula dos veces → 400 antes de llamar al SP', async () => {
    const execute = jest.fn();
    const { service } = crear(execute);
    const dto = dtoBase();
    dto.titulares[0].asegurados![0].rif_asegurado = 12345678;
    await expect(service.emitir('k', dto, SCOPE)).rejects.toMatchObject({ response: { code: 'COLECTIVO_PERSONA_DUPLICADA' } });
    expect(execute).not.toHaveBeenCalled();
  });
});
