import { ReportesPgService } from './reportes-pg.service';

type FakeClient = {
  statements: string[];
  query: jest.Mock;
  release: jest.Mock;
  on: jest.Mock;
};

function buildService(
  respond: (sql: string) => unknown = () => ({ rows: [], rowCount: 0 }),
) {
  const client: FakeClient = {
    statements: [],
    query: jest.fn(async (arg: unknown) => {
      const sql = typeof arg === 'string' ? arg : (arg as { text: string }).text;
      client.statements.push(sql);
      return respond(sql);
    }),
    release: jest.fn(),
    on: jest.fn(),
  };
  const service = new ReportesPgService({
    get: jest.fn(),
    getOrThrow: jest.fn(),
  } as never);
  const internals = service as unknown as {
    pool: unknown;
    enabled: boolean;
  };
  internals.enabled = true;
  internals.pool = { connect: jest.fn(async () => client), query: jest.fn() };
  return { service, client };
}

describe('ReportesPgService.runInTransaction', () => {
  it('agrupa las sentencias entre BEGIN y COMMIT', async () => {
    const { service, client } = buildService();

    const result = await service.runInTransaction(async (tx) => {
      await tx.executeQuery('DELETE FROM recibo WHERE id = @id', { id: 1 });
      await tx.executeQuery('INSERT INTO recibo (id) VALUES (@id)', { id: 1 });
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(client.statements[0]).toBe('BEGIN');
    expect(client.statements[1]).toContain('DELETE FROM recibo WHERE id = $1');
    expect(client.statements[2]).toContain('INSERT INTO recibo');
    expect(client.statements[client.statements.length - 1]).toBe('COMMIT');
    expect(client.statements).not.toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('hace ROLLBACK y relanza si una sentencia falla (el DELETE no queda aplicado)', async () => {
    const { service, client } = buildService((sql) => {
      if (sql.startsWith('INSERT')) throw new Error('fallo insert');
      return { rows: [], rowCount: 0 };
    });

    await expect(
      service.runInTransaction(async (tx) => {
        await tx.executeQuery('DELETE FROM recibo');
        await tx.executeQuery('INSERT INTO recibo (id) VALUES (1)');
      }),
    ).rejects.toThrow('fallo insert');

    expect(client.statements).toContain('ROLLBACK');
    expect(client.statements).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledWith(true);
  });
});

describe('ReportesPgService.executeSP aislamiento', () => {
  const routineRow = {
    schema_name: 'public',
    routine_name: 'sp_demo',
    prokind: 'f',
    argnames: '{}',
    argmodes: '{}',
    argtypes: [],
  };
  const respond = (sql: string) =>
    sql.includes('FROM pg_proc')
      ? { rows: [routineRow], rowCount: 1 }
      : { rows: [], rowCount: 0 };

  it('usa REPEATABLE READ cuando se solicita', async () => {
    const { service, client } = buildService(respond);
    await service.executeSP('sp_demo', {}, { isolationLevel: 'REPEATABLE READ' });
    expect(client.statements).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ');
  });

  it('mantiene BEGIN por defecto (sin cambiar a los demás reportes)', async () => {
    const { service, client } = buildService(respond);
    await service.executeSP('sp_demo', {});
    expect(client.statements).toContain('BEGIN');
    expect(client.statements).not.toContain('BEGIN ISOLATION LEVEL REPEATABLE READ');
  });
});
