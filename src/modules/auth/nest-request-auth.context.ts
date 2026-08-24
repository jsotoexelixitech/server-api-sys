import { AsyncLocalStorage } from 'async_hooks';
import { NestAuthContext } from './auth.types';

/** Bolsa mutable: el middleware abre el ALS y el guard rellena `auth`. */
export interface NestRequestAuthBag {
  auth?: NestAuthContext;
}

/**
 * Propaga el nestAuth del request al PartnerHost (singleton)
 * para que getConfig('CANAL_VENTA') lea el canal de la API key.
 *
 * enterWith() en el guard NO alcanza el controller en Nest/Express;
 * el middleware debe abrir el ALS con run() para todo el request.
 */
export const nestRequestAuthAls = new AsyncLocalStorage<NestRequestAuthBag>();

export function bindNestRequestAuth(auth: NestAuthContext): void {
  const bag = nestRequestAuthAls.getStore();
  if (bag) {
    bag.auth = auth;
    return;
  }
  // Fallback si el middleware no corrió (p.ej. tests).
  nestRequestAuthAls.enterWith({ auth });
}

export function getCurrentNestAuth(): NestAuthContext | undefined {
  return nestRequestAuthAls.getStore()?.auth;
}
