import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RmsPolizaWebhookBody } from './rms-gateway.mapper';

@Injectable()
export class RmsGatewayClient {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const flag = String(
      this.config.get('RMS_GATEWAY_ENABLED') ?? 'true',
    ).toLowerCase();
    if (flag === 'false' || flag === '0') return false;
    return Boolean(this.getBaseUrl() && this.getSecret());
  }

  getBaseUrl(): string {
    return String(this.config.get('RMS_GATEWAY_BASE_URL') ?? '')
      .trim()
      .replace(/\/$/, '');
  }

  getSecret(): string {
    return String(this.config.get('RMS_GATEWAY_WEBHOOK_SECRET') ?? '').trim();
  }

  getApiKey(): string {
    return String(this.config.get('RMS_GATEWAY_API_KEY') ?? '').trim();
  }

  isQueryEnabled(): boolean {
    const flag = String(
      this.config.get('RMS_GATEWAY_ENABLED') ?? 'true',
    ).toLowerCase();
    if (flag === 'false' || flag === '0') return false;
    return Boolean(this.getBaseUrl() && this.getApiKey());
  }

  async getPersonas(
    nacionalidad: string,
    cedrif: string,
  ): Promise<Array<Record<string, unknown>>> {
    const nac = String(nacionalidad || 'V').trim().charAt(0) || 'V';
    const rif = String(cedrif ?? '').replace(/\D/g, '');
    if (!rif || !this.isQueryEnabled()) return [];
    const q = `nacionalidad=${encodeURIComponent(nac)}&cedrif=${encodeURIComponent(rif)}`;
    const json = await this.getJson(`/api/v1/personas?${q}`);
    if (Array.isArray(json)) return json as Array<Record<string, unknown>>;
    if (json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items)) {
      return (json as { items: Array<Record<string, unknown>> }).items;
    }
    return [];
  }

  async postPolizas(body: RmsPolizaWebhookBody, eventId?: string): Promise<unknown> {
    return this.post('/api/v1/webhooks/polizas', body, eventId);
  }

  async postSiniestros(
    body: Record<string, unknown>,
    eventId?: string,
  ): Promise<unknown> {
    return this.post('/api/v1/webhooks/siniestros', body, eventId);
  }

  private timeoutMs(): number {
    return Number(this.config.get('RMS_GATEWAY_TIMEOUT_MS') ?? 8000);
  }

  private async getJson(path: string): Promise<unknown> {
    const url = `${this.getBaseUrl()}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs());
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'X-Api-Key': this.getApiKey() },
        signal: ac.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`RMS gateway HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async post(
    path: string,
    body: unknown,
    eventId?: string,
  ): Promise<unknown> {
    const url = `${this.getBaseUrl()}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs());
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': this.getSecret(),
          ...(eventId ? { 'X-Event-Id': eventId } : {}),
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`RMS gateway HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
