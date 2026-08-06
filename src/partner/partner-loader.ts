import { DynamicModule, Logger } from '@nestjs/common';
import type {
  PartnerModuleFactory,
  PartnerPackageExports,
  PartnerScopeMeta,
} from '@jsotoexelixitech/nest-api-sdk';
import {
  registerDiscoveredRoutes,
  registerPartnerScopeCatalog,
} from '../modules/auth/scopes/scope-catalog.registry';
import { discoverRoutesFromController } from '../modules/auth/scopes/scope-route-discovery';

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

function bindModuleRegister(
  pkgName: string,
  moduleClass: { register: PartnerModuleFactory; name?: string },
  source: string,
): PartnerModuleFactory {
  loaderLog.warn(
    `${pkgName}: exporte register() desde index.ts — usando ${source} como compatibilidad.`,
  );
  return moduleClass.register.bind(moduleClass);
}

function resolveRegister(
  pkgName: string,
  pkg: unknown,
): PartnerModuleFactory | null {
  const mod = pkg as PartnerPackageExports & { default?: unknown };
  const direct = mod.register ?? (mod.default as PartnerPackageExports | undefined)?.register;
  if (typeof direct === 'function') return direct;

  const defaultExport = mod.default;
  if (typeof defaultExport === 'function') {
    const moduleClass = defaultExport as {
      register?: PartnerModuleFactory;
      name?: string;
    };
    if (typeof moduleClass.register === 'function') {
      return bindModuleRegister(
        pkgName,
        moduleClass as { register: PartnerModuleFactory; name?: string },
        `${moduleClass.name ?? 'default'}.register`,
      );
    }
  }

  if (mod && typeof mod === 'object') {
    for (const [key, value] of Object.entries(mod as unknown as Record<string, unknown>)) {
      if (!key.endsWith('Module') || typeof value !== 'function') continue;
      const moduleClass = value as { register?: PartnerModuleFactory; name?: string };
      if (typeof moduleClass.register === 'function') {
        return bindModuleRegister(
          pkgName,
          moduleClass as { register: PartnerModuleFactory; name?: string },
          `${key}.register`,
        );
      }
    }
  }

  loaderLog.error(
    `Paquete ${pkgName} inválido: exporte register() (DynamicModule) desde index.js.`,
  );
  return null;
}

function resolvePartnerScopes(
  pkgName: string,
  pkg: unknown,
): PartnerScopeMeta[] | null {
  const mod = pkg as PartnerPackageExports & {
    default?: PartnerPackageExports;
    partnerScopes?: PartnerScopeMeta[];
  };
  const scopes = mod.partnerScopes ?? mod.default?.partnerScopes;
  if (!scopes?.length) return null;
  return scopes;
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

      const partnerScopes = resolvePartnerScopes(pkgName, pkg);
      if (partnerScopes) {
        registerPartnerScopeCatalog(partnerScopes, pkgName);
        loaderLog.log(
          `Scopes partner registrados (${partnerScopes.length}) desde ${pkgName}`,
        );
      }

      const dynamicModule = register();
      for (const controller of dynamicModule.controllers ?? []) {
        if (typeof controller !== 'function') continue;
        const routes = discoverRoutesFromController(controller);
        if (routes.length > 0) {
          registerDiscoveredRoutes(routes);
          loaderLog.log(
            `Rutas partner indexadas (${routes.length}) desde ${pkgName}`,
          );
        }
      }

      modules.push(dynamicModule);
      loadedPartnerPackages.push(pkgName);
      loaderLog.log(`Módulo partner cargado: ${pkgName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      loaderLog.error(`No se pudo cargar partner ${pkgName}: ${msg}`);
    }
  }

  return modules;
}
