import { DynamicModule, Logger, Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
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
import { requirePartnerPackage } from './partner-package-require';

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

/** Controllers del DynamicModule + imports anidados (@Module / DynamicModule). */
function collectControllersFromModuleRef(
  mod: DynamicModule | Type<unknown>,
  seen = new Set<unknown>(),
): Function[] {
  if (!mod || seen.has(mod)) return [];
  seen.add(mod);

  const out: Function[] = [];

  if (typeof mod === 'function') {
    const controllers =
      (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, mod) as unknown[]) ?? [];
    for (const c of controllers) {
      if (typeof c === 'function') out.push(c);
    }
    const imports =
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, mod) as unknown[]) ?? [];
    for (const imp of imports) {
      out.push(...collectControllersFromImport(imp, seen));
    }
    return out;
  }

  for (const c of mod.controllers ?? []) {
    if (typeof c === 'function') out.push(c);
  }
  for (const imp of mod.imports ?? []) {
    out.push(...collectControllersFromImport(imp, seen));
  }
  return out;
}

function collectControllersFromImport(
  imp: unknown,
  seen: Set<unknown>,
): Function[] {
  if (!imp) return [];
  if (typeof imp === 'function') {
    return collectControllersFromModuleRef(imp as Type<unknown>, seen);
  }
  if (typeof imp === 'object' && imp !== null && 'module' in imp) {
    return collectControllersFromModuleRef(imp as DynamicModule, seen);
  }
  return [];
}

/** Carga síncrona de paquetes npm listados en PARTNER_PACKAGES. */
export function loadPartnerDynamicModules(packageNames: string[]): DynamicModule[] {
  const modules: DynamicModule[] = [];

  for (const pkgName of packageNames) {
    try {
      const pkg = requirePartnerPackage(pkgName) as unknown;
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
      const controllers = collectControllersFromModuleRef(dynamicModule);
      let routeCount = 0;
      for (const controller of controllers) {
        const routes = discoverRoutesFromController(controller);
        if (routes.length > 0) {
          registerDiscoveredRoutes(routes);
          routeCount += routes.length;
        }
      }
      if (routeCount > 0) {
        loaderLog.log(
          `Rutas partner indexadas (${routeCount}) desde ${pkgName}`,
        );
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
