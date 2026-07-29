import { DynamicModule } from '@nestjs/common';

/** Token de inyección del host Exélixi (config acotada, logging). */
export const EXELIXI_PARTNER_HOST = Symbol('EXELIXI_PARTNER_HOST');

/** Superficie mínima expuesta al partner — sin servicios internos del core. */
export interface ExelixiPartnerHost {
  getConfig(key: string): string | undefined;
  log(level: 'log' | 'warn' | 'error', message: string, context?: string): void;
}

export interface PartnerModuleRegisterOptions {
  host?: ExelixiPartnerHost;
}

export type PartnerModuleFactory = (
  options?: PartnerModuleRegisterOptions,
) => DynamicModule;

/** Cada paquete npm partner debe exportar `register`. */
export interface PartnerPackageExports {
  register: PartnerModuleFactory;
}

/** Tag Swagger unificado para integraciones externas. */
export const PARTNER_SWAGGER_TAG = '8. Integraciones partner';
