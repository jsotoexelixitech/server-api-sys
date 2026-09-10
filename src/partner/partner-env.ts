import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';

/** Une y deduplica nombres de paquetes (coma-separados). */
export function mergePartnerPackageLists(...rawLists: (string | undefined)[]): string | undefined {
  const names: string[] = [];
  for (const raw of rawLists) {
    if (!raw?.trim()) continue;
    for (const name of raw.split(',')) {
      const trimmed = name.trim();
      if (trimmed && !names.includes(trimmed)) {
        names.push(trimmed);
      }
    }
  }
  return names.length > 0 ? names.join(',') : undefined;
}

/** Lee PARTNER_PACKAGES del .env (todas las líneas activas, no solo la primera). */
export function readPartnerPackagesConfig(): string | undefined {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const values = readFileSync(envPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('PARTNER_PACKAGES=') && !l.startsWith('#'))
      .map((line) => line.slice('PARTNER_PACKAGES='.length).trim())
      .map((value) => value.replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    const merged = mergePartnerPackageLists(...values);
    if (merged) return merged;
  }
  loadDotenv();
  return process.env.PARTNER_PACKAGES;
}
