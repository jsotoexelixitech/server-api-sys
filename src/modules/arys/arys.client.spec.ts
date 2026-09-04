import { BadGatewayException } from '@nestjs/common';
import { ArysClient } from './arys.client';
import { findBestByLabel, resolveEstadoArysName } from './arys.utils';

describe('ArysClient', () => {
  const mockConfig = {
    get: jest.fn(),
  };

  let client: ArysClient;

  beforeEach(() => {
    mockConfig.get.mockImplementation((key: string, defaultValue?: unknown) => {
      const map: Record<string, unknown> = {
        SARYS_BASE_URL: 'http://sarys.test',
        SARYS_TIMEOUT_MS: 5000,
        SARYS_API_ENABLED: 'true',
      };
      return map[key] ?? defaultValue;
    });
    client = new ArysClient(mockConfig as never);
  });

  it('mapea Dtto Capital al nombre de Arys', () => {
    expect(resolveEstadoArysName('Dtto Capital')).toBe('DISTRITO CAPITAL');
  });

  it('resuelve marca Arys por coincidencia de nombre (YAMAHA → YAMAHA MOTOR)', () => {
    const marca = findBestByLabel(
      [
        { id_marca: 12, marca1: 'HONDA' },
        { id_marca: 80, marca1: 'YAMAHA MOTOR' },
      ],
      'YAMAHA',
      ['marca1', 'marca', 'xmarca'],
    );
    expect(marca?.id_marca).toBe(80);
  });

  it('resuelve versión Arys por prefijo (R3 → R3 - Sincronico)', () => {
    const version = findBestByLabel(
      [
        { id_version: 9, version1: 'R1 ' },
        { id_version: 11, version1: 'R3 ', carroceria: 'R3 - Sincronico' },
      ],
      'R3',
      ['version1', 'carroceria'],
    );
    expect(version?.id_version).toBe(11);
  });

  it('rechaza AddVehiculo con result 0 e incluye errorMessage', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        isSuccess: true,
        errorMessage: 'id_version inválido',
        result: 0,
      }),
    } as Response);

    await expect(
      client.addVehiculo({
        id_propietario: 1,
        capacidad: 0,
        id_marca: 80,
        id_modelo: 11,
        id_version: 0,
        anio: 2024,
        id_color: 0,
        id_tipo_vehi: 0,
        placa: 'ARYST00',
        serial_carroceria: 'X',
        serial_motor: 'N/A',
        kilometraje: 0,
        capacidad_pasajero: 0,
        precio_inmas: 0,
        num_certificado_origen: '',
        importado: true,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('id_version inválido'),
    });
  });

  it('parsea result objeto de Coberturas', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        isSuccess: true,
        result: {
          primaRcv: 10,
          primaTotal: 50,
          montoMembresia: 40,
        },
      }),
    } as Response);

    const primas = await client.getCoberturas(99, 6);
    expect(primas.primaTotal).toBe(50);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://sarys.test/api/v1/Cotizador/Coberturas/99/6',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rechaza result vacío en Coberturas', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isSuccess: true, result: [] }),
    } as Response);

    await expect(client.getCoberturas(1, 6)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('registra membresía con body de primas', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        isSuccess: true,
        result: { certificado: 'ABC', placa: 'XYZ123' },
      }),
    } as Response);

    const result = await client.registrarSubcripcion(10, 20, 6, { primaTotal: 50 });
    expect(result).toEqual({ certificado: 'ABC', placa: 'XYZ123' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://sarys.test/api/v1/Cotizador/RegistrarSubcripcion/10/20/6',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ primaTotal: 50 }),
      }),
    );
  });
});
