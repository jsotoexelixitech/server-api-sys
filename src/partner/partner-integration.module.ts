import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';
import { DynamicModule, Logger, Module } from '@nestjs/common';
import { loadPartnerDynamicModules, parsePartnerPackageNames } from './partner-loader';

const integrationLog = new Logger('PartnerIntegration');

/** Lee PARTNER_PACKAGES del .env del proyecto (PM2 puede cachear env viejo). */
function readPartnerPackagesConfig(): string | undefined {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('PARTNER_PACKAGES=') && !l.startsWith('#'));
    if (line) {
      const value = line.slice('PARTNER_PACKAGES='.length).trim();
      if (value) {
        return value.replace(/^["']|["']$/g, '');
      }
    }
  }
  loadDotenv();
  return process.env.PARTNER_PACKAGES;
}

const partnerPackageRaw = readPartnerPackagesConfig();
integrationLog.log(
  partnerPackageRaw
    ? `PARTNER_PACKAGES=${partnerPackageRaw}`
    : 'PARTNER_PACKAGES vacío — sin módulos partner',
);

const partnerImports: DynamicModule[] = loadPartnerDynamicModules(
  parsePartnerPackageNames(partnerPackageRaw),
);

/** Agrega al AppModule los paquetes npm declarados en PARTNER_PACKAGES. */
@Module({
  imports: partnerImports,
})
export class PartnerIntegrationModule {}
