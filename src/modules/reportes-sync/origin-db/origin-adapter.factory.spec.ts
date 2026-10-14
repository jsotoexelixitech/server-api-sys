import { envValidationSchema } from '../../../config/env.validation';
import { OriginAdapterFactory } from './origin-adapter.factory';

jest.mock('./mssql-origin.adapter', () => ({
  MssqlOriginAdapter: jest.fn().mockImplementation((config) => ({ config })),
}));

const conexion = {
  tipoDb: 'mssql',
  host: '172.30.149.67',
  port: 1433,
  username: 'u',
  password: 'p',
  databaseName: 'Sis2000_QA',
} as never;

function fabrica(env: Record<string, unknown>) {
  const config = { get: jest.fn((k: string, d?: unknown) => (k in env ? env[k] : d)) };
  return new OriginAdapterFactory(config as never);
}

function opcionesMssql(env: Record<string, unknown>) {
  const adapter = fabrica(env).create(conexion) as unknown as {
    config: { options: Record<string, unknown> };
  };
  return adapter.config.options;
}

describe('OriginAdapterFactory · encrypt de la conexión de origen', () => {
  it('"false" como texto se pasa al driver como boolean false (antes rompía el sync)', () => {
    const o = opcionesMssql({ DB_ENCRYPT: 'false', DB_TRUST_SERVER_CERTIFICATE: 'true' });
    expect(o.encrypt).toBe(false);
    expect(o.trustServerCertificate).toBe(true);
  });

  it('"true" como texto → boolean true; "false" en trust → false', () => {
    const o = opcionesMssql({ DB_ENCRYPT: 'true', DB_TRUST_SERVER_CERTIFICATE: 'false' });
    expect(o.encrypt).toBe(true);
    expect(o.trustServerCertificate).toBe(false);
  });

  it('sin variables: encrypt false y trustServerCertificate true (comportamiento previo)', () => {
    const o = opcionesMssql({});
    expect(o.encrypt).toBe(false);
    expect(o.trustServerCertificate).toBe(true);
  });

  it('valores booleanos ya convertidos se respetan', () => {
    const o = opcionesMssql({ DB_ENCRYPT: true, DB_TRUST_SERVER_CERTIFICATE: false });
    expect(o.encrypt).toBe(true);
    expect(o.trustServerCertificate).toBe(false);
  });

  it('un valor desconocido cae al valor por defecto, no a verdadero', () => {
    const o = opcionesMssql({ DB_ENCRYPT: 'quizas' });
    expect(o.encrypt).toBe(false);
  });
});

describe('envValidationSchema · DB_ENCRYPT y DB_TRUST_SERVER_CERTIFICATE', () => {
  const validar = (env: Record<string, unknown>) =>
    envValidationSchema.validate(env, { abortEarly: false, allowUnknown: true });

  it('convierte el texto a boolean y no marca error en esas claves', () => {
    const { value, error } = validar({ DB_ENCRYPT: 'false', DB_TRUST_SERVER_CERTIFICATE: 'true' });
    expect(value.DB_ENCRYPT).toBe(false);
    expect(value.DB_TRUST_SERVER_CERTIFICATE).toBe(true);
    const claves = (error?.details ?? []).map((d) => String(d.path[0]));
    expect(claves).not.toContain('DB_ENCRYPT');
    expect(claves).not.toContain('DB_TRUST_SERVER_CERTIFICATE');
  });

  it('valores por defecto cuando no están definidas', () => {
    const { value } = validar({});
    expect(value.DB_ENCRYPT).toBe(false);
    expect(value.DB_TRUST_SERVER_CERTIFICATE).toBe(true);
  });
});

describe('OriginAdapterFactory · tamaño de paquete del origen', () => {
  it('por defecto usa 16384 bytes (el del driver es 4096)', () => {
    expect(opcionesMssql({}).packetSize).toBe(16384);
  });

  it('se puede configurar y se limita al rango que admite SQL Server', () => {
    expect(opcionesMssql({ REPORTES_SYNC_ORIGIN_PACKET_SIZE: 8192 }).packetSize).toBe(8192);
    expect(opcionesMssql({ REPORTES_SYNC_ORIGIN_PACKET_SIZE: 99999 }).packetSize).toBe(32767);
    expect(opcionesMssql({ REPORTES_SYNC_ORIGIN_PACKET_SIZE: 10 }).packetSize).toBe(512);
    expect(opcionesMssql({ REPORTES_SYNC_ORIGIN_PACKET_SIZE: 'abc' }).packetSize).toBe(16384);
  });
});
