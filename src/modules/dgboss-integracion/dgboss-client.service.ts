import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildDgbossHeaders } from './dgboss-signature.util';
import type { DgbossResult } from './dgboss.types';

/**
 * Cliente firmado de los webhooks de DGBOSS (catálogos y pólizas).
 * Serializa el body una sola vez y firma esos mismos bytes.
 */
@Injectable()
export class DgbossClientService {
  private readonly logger = new Logger(DgbossClientService.name);

  constructor(private readonly config: ConfigService) {}

  postCatalogos(payload: unknown, idempotencyKey?: string) {
    return this.post('/api/v1/catalogos', payload, idempotencyKey);
  }

  postPoliza(payload: unknown, idempotencyKey?: string) {
    return this.post('/api/v1/integraciones/polizas', payload, idempotencyKey);
  }

  private async post(
    path: string,
    payload: unknown,
    idempotencyKey?: string,
  ): Promise<DgbossResult> {
    const baseUrl = String(this.config.get<string>('DGBOSS_BASE_URL', '')).replace(/\/+$/, '');
    const apiToken = this.config.get<string>('DGBOSS_API_TOKEN', '');
    const secret = this.config.get<string>('DGBOSS_HMAC_SECRET', '');
    if (!baseUrl || !apiToken || !secret) {
      throw new Error('DGBOSS no configurado: faltan DGBOSS_BASE_URL, DGBOSS_API_TOKEN o DGBOSS_HMAC_SECRET.');
    }

    const rawBody = JSON.stringify(payload);
    const headers = buildDgbossHeaders({ apiToken, secret, rawBody, idempotencyKey });
    const timeoutMs = Number(this.config.get('DGBOSS_TIMEOUT_MS', 30000));

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* respuesta no JSON */
      }
      const codigo =
        body && typeof body === 'object' ? (body as { codigo?: string }).codigo : undefined;
      return {
        ok: res.ok,
        status: res.status,
        codigo,
        // 409/503 de idempotencia y 5xx se reintentan; 4xx de validación no.
        retryable: res.status >= 500 || res.status === 409 || res.status === 429,
        body,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`DGBOSS ${path} sin respuesta: ${msg}`);
      return { ok: false, status: 0, retryable: true, body: { error: msg } };
    }
  }
}
