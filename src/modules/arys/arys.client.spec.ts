import { BadGatewayException } from '@nestjs/common';
import { ArysClient } from './arys.client';
import { resolveEstadoArysName } from './arys.utils';

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
