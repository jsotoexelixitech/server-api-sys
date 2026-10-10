import { ClientService } from './client.service';
import { buildCorreoEmisionQuery, buildPolizaYCorreoMaestroQuery, normalizarPlacaContacto } from './titular-contacto';

function crear(respuestas: Record<string, unknown>[][]) {
  const consultas: { sql: string; inputs: Record<string, unknown> }[] = [];
  const db: any = {
    types: { VarChar: (n: number) => ({ t: 'varchar', n }), Numeric: (p: number, s: number) => ({ t: 'numeric', p, s }) },
    request: () => {
      const inputs: Record<string, unknown> = {};
      return {
        input: (n: string, _t: unknown, v: unknown) => { inputs[n] = v; },
        query: jest.fn(async (sql: string) => {
          consultas.push({ sql, inputs });
          return { recordset: respuestas.shift() ?? [] };
        }),
      };
    },
  };
  return { service: new ClientService(db), consultas };
}

describe('titular-contacto: consultas', () => {
  it('exigen cédula y placa como parámetros (nunca concatenados)', () => {
    for (const q of [buildCorreoEmisionQuery('AB385WR', 123), buildPolizaYCorreoMaestroQuery('AB385WR', 123)]) {
      expect(q.sql).toContain('@placa');
      expect(q.sql).toContain('@cci_rif');
      expect(q.sql).not.toContain('AB385WR');
      expect(q.params.map((p) => p.name)).toEqual(['placa', 'cci_rif']);
    }
  });

  it('descartan correos inválidos o de prueba', () => {
    const { sql } = buildCorreoEmisionQuery('AB385WR', 1);
    expect(sql).toContain("LIKE '_%@_%._%'");
    expect(sql).toContain("NOT LIKE '%@example.com'");
  });

  it('la emisión toma la fila más reciente', () => {
    expect(buildCorreoEmisionQuery('AB385WR', 1).sql).toContain('ORDER BY id DESC');
  });

  it('normaliza la placa', () => {
    expect(normalizarPlacaContacto(' ab-385 wr ')).toBe('AB385WR');
  });
});

describe('ClientService.getTitularContacto', () => {
  it('usa el correo de la emisión y marca la póliza como encontrada', async () => {
    const { service, consultas } = crear([[{ correo: 'titular@dominio.com' }], [{ encontrada: 1, correo: 'maestro@dominio.com' }]]);
    await expect(service.getTitularContacto({ placa: 'AB385WR', cci_rif: 123 })).resolves.toEqual({
      encontrada: true,
      correo: 'titular@dominio.com',
    });
    expect(consultas).toHaveLength(2);
    expect(consultas[0].inputs).toEqual({ placa: 'AB385WR', cci_rif: 123 });
  });

  it('sin correo de emisión cae al maestro', async () => {
    const { service } = crear([[], [{ encontrada: 1, correo: 'maestro@dominio.com' }]]);
    await expect(service.getTitularContacto({ placa: 'AB385WR', cci_rif: 123 })).resolves.toEqual({
      encontrada: true,
      correo: 'maestro@dominio.com',
    });
  });

  it('póliza sin ningún correo: encontrada pero correo null', async () => {
    const { service } = crear([[], [{ encontrada: 1, correo: null }]]);
    await expect(service.getTitularContacto({ placa: 'AB385WR', cci_rif: 123 })).resolves.toEqual({
      encontrada: true,
      correo: null,
    });
  });

  it('placa y cédula que no coinciden con ninguna póliza: no encontrada y sin correo', async () => {
    const { service } = crear([[], []]);
    await expect(service.getTitularContacto({ placa: 'ZZZ999', cci_rif: 1 })).resolves.toEqual({
      encontrada: false,
      correo: null,
    });
  });

  it('el correo de emisión solo cuenta si hay póliza (no revela correos de placas ajenas)', async () => {
    const { service } = crear([[{ correo: 'x@dominio.com' }], []]);
    await expect(service.getTitularContacto({ placa: 'AB385WR', cci_rif: 123 })).resolves.toEqual({
      encontrada: false,
      correo: null,
    });
  });
});
