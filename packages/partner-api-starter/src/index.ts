export { PartnerStarterModule } from './partner-starter.module';
export { PartnerStarterController } from './partner-starter.controller';

import { PartnerStarterModule } from './partner-starter.module';

/** Entrada estándar que carga sysip-nest-api vía PARTNER_PACKAGES. */
export function register(
  options?: import('@jsotoexelixitech/nest-api-sdk').PartnerModuleRegisterOptions,
) {
  return PartnerStarterModule.register(options);
}
