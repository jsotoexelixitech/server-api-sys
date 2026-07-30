import { DynamicModule, Module } from '@nestjs/common';
import { loadPartnerDynamicModules, parsePartnerPackageNames } from './partner-loader';
import { readPartnerPackagesConfig } from './partner-env';

const partnerImports: DynamicModule[] = loadPartnerDynamicModules(
  parsePartnerPackageNames(readPartnerPackagesConfig()),
);

/** Agrega al AppModule los paquetes npm declarados en PARTNER_PACKAGES. */
@Module({
  imports: partnerImports,
})
export class PartnerIntegrationModule {}
