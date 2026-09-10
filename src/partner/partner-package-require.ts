import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';

const repoRequire = createRequire(resolve(process.cwd(), 'package.json'));

interface PartnerPackageJson {
  main?: string;
  module?: string;
  exports?: string | Record<string, unknown>;
}

/** Rutas típicas de bootstrap standalone — no deben ejecutarse vía require del host. */
const BOOTSTRAP_MAIN_PATTERN = /(?:^|[/\\])(?:main|server|bootstrap)\.(?:js|mjs|cjs)$/i;

const LIBRARY_ENTRY_CANDIDATES = [
  'dist/index.js',
  'lib/index.js',
  'index.js',
  'dist/index.mjs',
  'index.mjs',
];

function readPartnerPackageJson(pkgName: string): PartnerPackageJson | null {
  try {
    const pkgJsonPath = repoRequire.resolve(`${pkgName}/package.json`);
    return JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as PartnerPackageJson;
  } catch {
    return null;
  }
}

function resolvePackageRoot(pkgName: string): string | null {
  try {
    return dirname(repoRequire.resolve(`${pkgName}/package.json`));
  } catch {
    return null;
  }
}

function isBootstrapEntry(relativePath: string | undefined): boolean {
  if (!relativePath?.trim()) return false;
  return BOOTSTRAP_MAIN_PATTERN.test(relativePath.replace(/\\/g, '/'));
}

function resolveExportEntry(
  exportsField: PartnerPackageJson['exports'],
): string | undefined {
  if (!exportsField) return undefined;
  if (typeof exportsField === 'string') return exportsField;
  const root = exportsField['.'];
  if (typeof root === 'string') return root;
  if (root && typeof root === 'object') {
    const record = root as Record<string, string | undefined>;
    return record.require ?? record.import ?? record.default;
  }
  return undefined;
}

/** Prioriza entradas de librería; evita main.js con bootstrap que compite por el puerto del host. */
export function resolvePartnerLibraryEntry(pkgName: string): {
  absolutePath: string;
  label: string;
} | null {
  const pkgRoot = resolvePackageRoot(pkgName);
  const manifest = readPartnerPackageJson(pkgName);
  if (!pkgRoot || !manifest) return null;

  const candidates: string[] = [];
  const exportEntry = resolveExportEntry(manifest.exports);
  if (exportEntry && !isBootstrapEntry(exportEntry)) {
    candidates.push(exportEntry);
  }
  if (manifest.module && !isBootstrapEntry(manifest.module)) {
    candidates.push(manifest.module);
  }
  if (manifest.main && !isBootstrapEntry(manifest.main)) {
    candidates.push(manifest.main);
  }
  for (const relative of LIBRARY_ENTRY_CANDIDATES) {
    if (!candidates.includes(relative)) {
      candidates.push(relative);
    }
  }

  for (const relative of candidates) {
    const normalized = relative.replace(/^\.\//, '');
    const absolutePath = join(pkgRoot, normalized);
    if (existsSync(absolutePath)) {
      return { absolutePath, label: normalized };
    }
  }

  if (isBootstrapEntry(manifest.main)) {
    return null;
  }

  return null;
}

/** require seguro: no ejecuta bootstrap standalone del partner. */
export function requirePartnerPackage(pkgName: string): unknown {
  const entry = resolvePartnerLibraryEntry(pkgName);
  if (!entry) {
    const manifest = readPartnerPackageJson(pkgName);
    if (manifest?.main && isBootstrapEntry(manifest.main)) {
      throw new Error(
        `entry "${manifest.main}" es bootstrap standalone — publique dist/index.js con export function register()`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    return require(pkgName);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require(entry.absolutePath);
}
