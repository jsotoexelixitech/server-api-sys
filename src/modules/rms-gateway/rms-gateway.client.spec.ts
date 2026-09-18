import { RmsGatewayClient } from './rms-gateway.client';

describe('RmsGatewayClient', () => {
  const config = {
    get: jest.fn((key: string, def?: string) => {
      const map: Record<string, string> = {
        RMS_GATEWAY_ENABLED: 'true',
        RMS_GATEWAY_BASE_URL: 'http://127.0.0.1:3033/rms-gateway-services',
        RMS_GATEWAY_WEBHOOK_SECRET: 'test-secret',
        RMS_GATEWAY_TIMEOUT_MS: '2000',
      };
      return map[key] ?? def;
    }),
  };

  it('no habilita sin URL o secreto', () => {
    const empty = {
      get: jest.fn(() => ''),
    };
    expect(new RmsGatewayClient(empty as never).isEnabled()).toBe(false);
  });

  it('POST /webhooks/polizas con X-Webhook-Secret', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"ok":true}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new RmsGatewayClient(config as never);
    await client.postPolizas({
      evento: 'poliza.actualizada',
      cpoliza: '1',
      poliza_detalle: { poliza: { poliza: '45-1-1' }, riesgo: [] },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3033/rms-gateway-services/api/v1/webhooks/polizas',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Webhook-Secret': 'test-secret',
        }),
      }),
    );
  });

  it('GET /personas con X-Api-Key', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"items":[{"cedrif":"28511812","nombreCompleto":"JORGE"}]}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const withKey = {
      get: jest.fn((key: string, def?: string) => {
        const map: Record<string, string> = {
          RMS_GATEWAY_ENABLED: 'true',
          RMS_GATEWAY_BASE_URL: 'http://127.0.0.1:3033/rms-gateway-services',
          RMS_GATEWAY_WEBHOOK_SECRET: 'test-secret',
          RMS_GATEWAY_API_KEY: 'ik_test_key_min_24_chars_xx',
          RMS_GATEWAY_TIMEOUT_MS: '2000',
        };
        return map[key] ?? def;
      }),
    };
    const client = new RmsGatewayClient(withKey as never);
    const items = await client.getPersonas('V', '28511812');
    expect(items[0]?.['cedrif']).toBe('28511812');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3033/rms-gateway-services/api/v1/personas?nacionalidad=V&cedrif=28511812',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-Api-Key': 'ik_test_key_min_24_chars_xx',
        }),
      }),
    );
  });
});
