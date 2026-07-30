import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';

/** Lee PARTNER_PACKAGES del .env del proyecto (PM2 puede cachear env viejo). */
export function readPartnerPackagesConfig(): string | undefined {
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
