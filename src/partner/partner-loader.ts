import { DynamicModule, Logger } from '@nestjs/common';
import type { PartnerModuleFactory, PartnerPackageExports } from '@jsotoexelixitech/nest-api-sdk';

const loaderLog = new Logger('PartnerLoader');

/** Paquetes cargados correctamente (visible en bootstrap vía getLoadedPartnerPackageNames). */
const loadedPartnerPackages: string[] = [];

export function getLoadedPartnerPackageNames(): readonly string[] {
  return loadedPartnerPackages;
}

export function parsePartnerPackageNames(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

function resolveRegister(
  pkgName: string,
  pkg: unknown,
): PartnerModuleFactory | null {
  const mod = pkg as PartnerPackageExports & { default?: PartnerPackageExports };
  const register = mod.register ?? mod.default?.register;
  if (typeof register !== 'function') {
    loaderLog.error(
      `Paquete ${pkgName} inválido: exporte register() (DynamicModule).`,
    );
    return null;
  }
  return register;
}

/** Carga síncrona de paquetes npm listados en PARTNER_PACKAGES. */
export function loadPartnerDynamicModules(packageNames: string[]): DynamicModule[] {
  const modules: DynamicModule[] = [];

  for (const pkgName of packageNames) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const pkg = require(pkgName) as unknown;
      const register = resolveRegister(pkgName, pkg);
      if (!register) continue;
      modules.push(register());
      loadedPartnerPackages.push(pkgName);
      loaderLog.log(`Módulo partner cargado: ${pkgName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      loaderLog.error(`No se pudo cargar partner ${pkgName}: ${msg}`);
    }
  }

  return modules;
}
