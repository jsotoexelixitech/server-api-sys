import { AsyncLocalStorage } from 'async_hooks';
import { NestAuthContext } from './auth.types';

/**
 * Propaga el nestAuth del request al PartnerHost (singleton)
 * para que getConfig('CANAL_VENTA') lea el canal de la API key.
 */
export const nestRequestAuthAls = new AsyncLocalStorage<NestAuthContext>();

export function bindNestRequestAuth(auth: NestAuthContext): void {
  nestRequestAuthAls.enterWith(auth);
}

export function getCurrentNestAuth(): NestAuthContext | undefined {
  return nestRequestAuthAls.getStore();
}
