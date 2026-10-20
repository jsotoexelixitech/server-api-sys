import { createHmac } from 'node:crypto';
import { buildDgbossHeaders, signDgbossBody } from './dgboss-signature.util';

describe('dgboss-signature', () => {
  const body = '{"a":"Pérez","n":1}';

  it('firma body crudo + timestamp en hex de 64 caracteres', () => {
    const sig = signDgbossBody('secreto', body, '1761234567890');
    const esperado = createHmac('sha256', 'secreto')
      .update(body + '1761234567890', 'utf8')
      .digest('hex');
    expect(sig).toBe(esperado);
    expect(sig).toHaveLength(64);
  });

  it('cambiar un byte del body o el timestamp cambia la firma', () => {
    const base = signDgbossBody('s', body, '1');
    expect(signDgbossBody('s', body + ' ', '1')).not.toBe(base);
    expect(signDgbossBody('s', body, '2')).not.toBe(base);
  });

  it('arma los headers obligatorios y reutiliza la clave de idempotencia', () => {
    const h = buildDgbossHeaders({
      apiToken: 'tok',
      secret: 's',
      rawBody: body,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      now: 1761234567890,
    });
    expect(h.Authorization).toBe('Bearer tok');
    expect(h['X-Idempotency-Key']).toBe('11111111-1111-4111-8111-111111111111');
    expect(h['X-Timestamp']).toBe('1761234567890');
    expect(h['X-Signature']).toBe(signDgbossBody('s', body, '1761234567890'));
  });

  it('genera UUID cuando no se pasa clave', () => {
    const h = buildDgbossHeaders({ apiToken: 't', secret: 's', rawBody: '{}' });
    expect(h['X-Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
