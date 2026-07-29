import { config as loadDotenv } from 'dotenv';
import { DynamicModule, Module } from '@nestjs/common';
import { loadPartnerDynamicModules, parsePartnerPackageNames } from './partner-loader';

loadDotenv();

const partnerImports: DynamicModule[] = loadPartnerDynamicModules(
  parsePartnerPackageNames(process.env.PARTNER_PACKAGES),
);

/** Agrega al AppModule los paquetes npm declarados en PARTNER_PACKAGES. */
@Module({
  imports: partnerImports,
})
export class PartnerIntegrationModule {}
