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
});
