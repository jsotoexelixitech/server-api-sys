import { createHmac, randomUUID } from 'node:crypto';

export type DgbossSignedHeaders = {
  'Content-Type': 'application/json';
  Authorization: string;
  'X-Idempotency-Key': string;
  'X-Timestamp': string;
  'X-Signature': string;
};

/** HMAC-SHA256(secret, rawBody + utf8(timestamp)) en hex (64 caracteres). */
export function signDgbossBody(
  secret: string,
  rawBody: string,
  timestamp: string,
): string {
  return createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(rawBody, 'utf8'), Buffer.from(timestamp, 'utf8')]))
    .digest('hex');
}

export function buildDgbossHeaders(opts: {
  apiToken: string;
  secret: string;
  rawBody: string;
  idempotencyKey?: string;
  now?: number;
}): DgbossSignedHeaders {
  const timestamp = String(opts.now ?? Date.now());
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.apiToken}`,
    'X-Idempotency-Key': opts.idempotencyKey ?? randomUUID(),
    'X-Timestamp': timestamp,
    'X-Signature': signDgbossBody(opts.secret, opts.rawBody, timestamp),
  };
}
