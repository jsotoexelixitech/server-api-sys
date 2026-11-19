import { ConflictException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Subject, firstValueFrom, of } from 'rxjs';
import { EmisionUnicaInterceptor, _emisionesEnCurso, claveEmision } from './emision-unica.interceptor';

const ctx = (body: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ body }) }) }) as unknown as ExecutionContext;

describe('claveEmision', () => {
  it('auto: por placa (sin guiones, mayúsculas)', () => {
    expect(claveEmision({ xplaca: 'ab-104 sn' })).toBe('placa:AB104SN');
    expect(claveEmision({ placa: 'AB104SN', rif_titular: 1 })).toBe('placa:AB104SN');
    expect(claveEmision({ vehicle: { placa: 'ab104sn' } })).toBe('placa:AB104SN');
  });

  it('personas: titular + ramo + plan', () => {
    expect(claveEmision({ cramo: 5, plan: 'VIAJE5', rif_titular: 12345678 })).toBe('persona:12345678:5-VIAJE5');
    expect(claveEmision({ cramo: 25, plan: 'VIAJE4', asegurados: [{ xrif_asegurado: '999' }] })).toBe('persona:999:25-VIAJE4');
  });

  it('riesgos generales / genérica: tomador como objeto', () => {
    expect(claveEmision({ cramo: 28, cplan: 'RCG', tomador: { rif: 'J-50000001-2' } })).toBe('persona:J500000012:28-RCG');
    expect(claveEmision({ productId: 'p1', tomador: { identificacion: 'V-1' } })).toBe('persona:V1:-P1');
  });

  it('sin placa ni persona no bloquea', () => {
    expect(claveEmision({ cramo: 5 })).toBeNull();
    expect(claveEmision(undefined)).toBeNull();
  });
});

describe('EmisionUnicaInterceptor', () => {
  const interceptor = new EmisionUnicaInterceptor();
  beforeEach(() => _emisionesEnCurso.clear());

  it('la segunda emisión con la misma placa mientras la primera sigue → 409; al terminar se libera', async () => {
    const primera = new Subject<unknown>();
    const handler1: CallHandler = { handle: () => primera.asObservable() };
    const sub = interceptor.intercept(ctx({ xplaca: 'AB104SN' }), handler1).subscribe();

    expect(() => interceptor.intercept(ctx({ placa: 'ab104sn' }), { handle: () => of('x') })).toThrow(ConflictException);

    primera.next('poliza');
    primera.complete();
    sub.unsubscribe();
    await expect(firstValueFrom(interceptor.intercept(ctx({ xplaca: 'AB104SN' }), { handle: () => of('ok') }))).resolves.toBe('ok');
  });

  it('también se libera si la primera falla', async () => {
    const primera = new Subject<unknown>();
    interceptor.intercept(ctx({ xplaca: 'AA1' }), { handle: () => primera.asObservable() }).subscribe({ error: () => undefined });
    primera.error(new Error('timeout'));
    await expect(firstValueFrom(interceptor.intercept(ctx({ xplaca: 'AA1' }), { handle: () => of('ok') }))).resolves.toBe('ok');
  });

  it('placas distintas no se bloquean entre sí', async () => {
    const primera = new Subject<unknown>();
    interceptor.intercept(ctx({ xplaca: 'AA1' }), { handle: () => primera.asObservable() }).subscribe();
    await expect(firstValueFrom(interceptor.intercept(ctx({ xplaca: 'BB2' }), { handle: () => of('ok') }))).resolves.toBe('ok');
    primera.complete();
  });
});
