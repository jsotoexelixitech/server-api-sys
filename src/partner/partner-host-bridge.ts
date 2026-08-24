import type { ExelixiPartnerHost } from '@jsotoexelixitech/nest-api-sdk';

/** Host del core con queryMaclientApi (el SDK publicado puede tiparlo como opcional o no). */
export type ExelixiPartnerHostWithMaclient = ExelixiPartnerHost & {
  queryMaclientApi?(canal_venta: string): Promise<Record<string, any> | null>;
};

/**
 * Host lazy: el loader llama register({ host: bridge }) antes de que exista el DI.
 * PartnerHostService se engancha en onModuleInit.
 */
let hostRef: ExelixiPartnerHostWithMaclient | null = null;

export function bindPartnerHostRef(host: ExelixiPartnerHostWithMaclient): void {
  hostRef = host;
}

export const partnerHostBridge: ExelixiPartnerHostWithMaclient = {
  getConfig(key: string): string | undefined {
    return hostRef?.getConfig(key);
  },
  log(level, message, context): void {
    hostRef?.log(level, message, context);
  },
  queryMaclientApi(canal_venta: string) {
    return hostRef?.queryMaclientApi?.(canal_venta) ?? Promise.resolve(null);
  },
};
