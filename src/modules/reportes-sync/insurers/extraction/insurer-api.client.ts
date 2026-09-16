import { Injectable } from '@nestjs/common';
import type { ResolvedOriginConfig } from './origin-config.resolver';

function getByPath(obj: unknown, path: string): unknown {
  if (!path) {
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (Array.isArray(record.data)) return record.data;
      if (Array.isArray(record.rows)) return record.rows;
      if (Array.isArray(record.recordset)) return record.recordset;
    }
    return obj;
  }

  return String(path)
    .split('.')
    .reduce<unknown>((acc, key) => {
      if (acc == null || typeof acc !== 'object') return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);
}

function buildApiPayload(
  watermark: Date | null,
  filtros: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (filtros.refreshScope) {
    payload.refreshScope = true;
  } else if (watermark) {
    payload.watermark = watermark.toISOString();
  }
  if (filtros.desde instanceof Date) {
    payload.desde = filtros.desde.toISOString();
  }
  if (filtros.hasta instanceof Date) {
    payload.hasta = filtros.hasta.toISOString();
  }
  return payload;
}

@Injectable()
export class InsurerApiClient {
  async fetchIncrementalRows(
    apiConfig: ResolvedOriginConfig,
    watermark: Date | null,
    filtros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    if (!apiConfig?.apiUrl) {
      throw new Error('API_URL requerida para modo de extracción api');
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (apiConfig.apiToken) {
      headers.Authorization = apiConfig.apiToken.startsWith('Bearer ')
        ? apiConfig.apiToken
        : `Bearer ${apiConfig.apiToken}`;
    }

    const payload = buildApiPayload(watermark, filtros);
    const method = apiConfig.apiMethod || 'GET';
    let url = apiConfig.apiUrl;

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(apiConfig.apiTimeoutMs || 60000),
    };

    if (method === 'GET') {
      const parsed = new URL(url);
      Object.entries(payload).forEach(([key, value]) => {
        if (value != null) parsed.searchParams.set(key, String(value));
      });
      url = parsed.toString();
    } else {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `API origen respondió ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    const json: unknown = await response.json();
    const rows = getByPath(json, apiConfig.apiRowsPath);
    if (!Array.isArray(rows)) {
      throw new Error('La respuesta API no contiene un arreglo de filas');
    }
    return rows as Record<string, unknown>[];
  }

  async healthCheck(
    apiConfig: ResolvedOriginConfig,
  ): Promise<Record<string, unknown>> {
    const started = Date.now();
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiConfig.apiToken) {
        headers.Authorization = apiConfig.apiToken.startsWith('Bearer ')
          ? apiConfig.apiToken
          : `Bearer ${apiConfig.apiToken}`;
      }
      const response = await fetch(apiConfig.apiUrl!, {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(apiConfig.apiTimeoutMs || 10000),
      });
      return {
        ok: response.ok,
        latencyMs: Date.now() - started,
        motor: 'api',
        status: response.status,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        motor: 'api',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
