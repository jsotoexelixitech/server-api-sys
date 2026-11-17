import { BadRequestException, NotImplementedException } from '@nestjs/common';
import { FLOTA_SP, FlotaService } from './flota.service';
import { MssqlService } from '../../database/mssql.service';

/** Request de mssql simulado: registra inputs y responde según el SQL o el SP. */
function fakeDb(opts: {
  spExiste: boolean;
  output?: Record<string, unknown>;
  /** Respuesta a las consultas que no son OBJECT_ID (por fragmento del SQL). */
  filas?: (sql: string, inputs: Record<string, unknown>) => Record<string, unknown>[];
}) {
  const calls: { sp?: string; sql?: string; inputs: Record<string, unknown> }[] = [];
  const db = {
    request: () => {
      const inputs: Record<string, unknown> = {};
      const r = {
        input: (k: string, _t: unknown, v: unknown) => { inputs[k] = v; return r; },
        output: () => r,
        query: async (sql: string) => {
          if (sql.includes('OBJECT_ID')) return { recordset: [{ id: opts.spExiste ? 123 : null }] };
          calls.push({ sql, inputs });
          return { recordset: opts.filas?.(sql, inputs) ?? [] };
        },
        execute: async (sp: string) => {
          calls.push({ sp, inputs });
          return { output: opts.output ?? {} };
        },
      };
      return r;
    },
  } as unknown as MssqlService;
  return { db, calls };
}

const recibo = {
  mprima: 1, cmoneda: '$', fdesde: '2026-11-01', fhasta: '2026-11-01', creferencia: 'VIAJE:RDY-1',
};

describe('FlotaService (nest-api)', () => {
  it('responde 501 si el SP propuesto no existe en Sis2000', async () => {
    const { db, calls } = fakeDb({ spExiste: false });
    const svc = new FlotaService(db);
    await expect(svc.crearReciboCertificado('18-1-1130480881', 3, recibo)).rejects.toBeInstanceOf(NotImplementedException);
    expect(calls).toHaveLength(0);
  });

  it('llama a sp_crear_recibo_certificado_nexus con el certificado y la referencia', async () => {
    const { db, calls } = fakeDb({
      spExiste: true,
      output: { pSuccess: true, pCnrecibo: ' 18-998877 ', pCrecibo: 998877, pYaExistia: false, pErrorMessage: '' },
    });
    const svc = new FlotaService(db);
    const r = await svc.crearReciboCertificado('18-1-1130480881', 3, recibo);
    expect(calls[0].sp).toBe(FLOTA_SP.RECIBO_CERTIFICADO);
    expect(calls[0].inputs).toMatchObject({ cnpoliza: '18-1-1130480881', ccerti: 3, mprima: 1, creferencia: 'VIAJE:RDY-1' });
    expect(r).toMatchObject({ status: true, cnrecibo: '18-998877', crecibo: '998877', yaExistia: false });
  });

  it('400 si el SP devuelve pSuccess = 0', async () => {
    const { db } = fakeDb({ spExiste: true, output: { pSuccess: false, pErrorMessage: 'Certificado no vigente' } });
    const svc = new FlotaService(db);
    await expect(svc.crearReciboCertificado('18-1-1130480881', 3, recibo)).rejects.toThrow('Certificado no vigente');
  });

  it('400 si fhasta es anterior a fdesde', async () => {
    const { db } = fakeDb({ spExiste: true });
    const svc = new FlotaService(db);
    await expect(svc.crearReciboCertificado('X', 1, { ...recibo, fdesde: '2026-11-02', fhasta: '2026-11-01' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('crear póliza manda la firma real de sp_flota_crear_poliza_nexus y devuelve cnpoliza/cpoliza', async () => {
    const { db, calls } = fakeDb({
      spExiste: true,
      output: { pSuccess: true, pCnpoliza: ' 18-1-1130499999 ', pCpoliza: 1234, pErrorMessage: '' },
    });
    const svc = new FlotaService(db);
    const r = await svc.crearPoliza({
      cramo: 18, cplan: 'RIDER1', cidTomador: 'J-123456789', fdesde: '2026-11-01', fhasta: '2027-11-01',
    });
    expect(calls[0].sp).toBe(FLOTA_SP.CREAR_POLIZA);
    expect(Object.keys(calls[0].inputs).sort()).toEqual(
      ['cid_tomador', 'cmoneda', 'cplan', 'cproductor', 'cramo', 'csucur', 'cusuario', 'fdesde', 'fhasta'],
    );
    expect(r).toMatchObject({ status: true, cnpoliza: '18-1-1130499999', cpoliza: '1234' });
  });

  it('crear póliza devuelve cpoliza NUMERIC(19) exacto (releído como texto)', async () => {
    const { db } = fakeDb({
      spExiste: true,
      // El driver ya redondeó el OUTPUT (pérdida de precisión de JS).
      output: { pSuccess: true, pCnpoliza: '18-1-0130481032', pCpoliza: 1800000000000171500, pErrorMessage: '' },
      filas: (sql) => (sql.includes('FROM adpoliza') ? [{ v: '1800000000000171560' }] : []),
    });
    const r = await new FlotaService(db).crearPoliza({
      cramo: 18, cplan: 'RIDER1', cidTomador: 'J-123456789', fdesde: '2026-11-01', fhasta: '2027-11-01',
    });
    expect(r.cpoliza).toBe('1800000000000171560');
  });

  it('GET póliza devuelve cpoliza como texto exacto y filtra con VARCHAR', async () => {
    const { db, calls } = fakeDb({
      spExiste: true,
      filas: (sql) => (sql.includes('FROM adpoliza')
        ? [{ cpoliza: '1800000000000171560', cnpoliza: '18-1-0130481032', fanopol: 2026, fmespol: 11 }]
        : []),
    });
    const r = await new FlotaService(db).getPolizaFlota('18-1-0130481032');
    expect(r.poliza.cpoliza).toBe('1800000000000171560');
    const certs = calls.find((c) => c.sql?.includes('FROM vhcerti'));
    expect(certs?.inputs.cpoliza).toBe('1800000000000171560');
    expect(certs?.sql).toContain('CAST(@cpoliza AS NUMERIC(19, 0))');
  });

  it('la inclusión de certificado manda @generarRecibo = 0', async () => {
    const { db, calls } = fakeDb({ spExiste: true, output: { pSuccess: true, pCcerti: 7 } });
    const svc = new FlotaService(db);
    const r = await svc.incluirCertificado('18-1-1130480881', {
      xplaca: 'ab123cd', conductor: { cid: 'V-12345678', nombre: 'JOSE PEREZ' },
    });
    expect(calls[0].sp).toBe(FLOTA_SP.INCLUIR_CERTIFICADO);
    expect(calls[0].inputs).toMatchObject({ xplaca: 'AB123CD', generarRecibo: 0, cid_conductor: 'V-12345678' });
    expect(r).toMatchObject({ status: true, ccerti: 7 });
  });
});
