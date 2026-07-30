import type { PartnerScopeMeta } from '@jsotoexelixitech/nest-api-sdk';
import {
  NEST_AUTH_SCOPE_CATALOG,
  NestAuthScopeMeta,
} from './nest-auth-scopes.constants';

export interface DiscoveredRoute {
  method: string;
  path: string;
  scopeId?: string;
}

const partnerDeclaredScopes = new Map<string, NestAuthScopeMeta>();
const discoveredRoutesByScope = new Map<string, Set<string>>();

/** Scopes declarados en el paquete npm partner (export `partnerScopes`). */
export function registerPartnerScopeCatalog(
  entries: PartnerScopeMeta[],
  packageName?: string,
): void {
  for (const entry of entries) {
    const id = String(entry.id ?? '').trim();
    if (!id) continue;

    const existing = partnerDeclaredScopes.get(id);
    const routes = [...(entry.routes ?? [])];
    if (existing) {
      existing.label = entry.label || existing.label;
      existing.description = entry.description || existing.description;
      existing.routes = [...new Set([...existing.routes, ...routes])];
      continue;
    }

    partnerDeclaredScopes.set(id, {
      id,
      label: entry.label || id,
      description:
        entry.description ||
        (packageName
          ? `Integración partner (${packageName})`
          : `Integración partner (${id})`),
      routes,
    });
  }
}

function defaultScopeMeta(
  scopeId: string,
): Pick<NestAuthScopeMeta, 'label' | 'description'> {
  if (scopeId.startsWith('partner:')) {
    const slug = scopeId.slice('partner:'.length);
    return {
      label: `Partner: ${slug}`,
      description: `Endpoints bajo /api/v1/partner/${slug}/`,
    };
  }

  const [namespace, action] = scopeId.split(':');
  return {
    label: action ? `${namespace} · ${action}` : scopeId,
    description: `Permiso ${scopeId}`,
  };
}

/** Registra rutas descubiertas al arrancar (core @NestProtected + partner). */
export function registerDiscoveredRoutes(routes: DiscoveredRoute[]): void {
  for (const route of routes) {
    const normalizedPath = route.path.replace(/\/{2,}/g, '/');
    const routeLine = `${route.method.toUpperCase()} ${normalizedPath}`;

    let scopeId = route.scopeId?.trim();

    if (!scopeId) {
      const partnerMatch = normalizedPath.match(/\/api\/v1\/partner\/([^/]+)/i);
      if (partnerMatch) {
        scopeId = `partner:${partnerMatch[1]}`;
      } else if (/\/api\/v1\/admin\/(keys|scopes)/i.test(normalizedPath)) {
        scopeId = 'admin:keys';
      } else {
        continue;
      }
    }

    const bucket = discoveredRoutesByScope.get(scopeId) ?? new Set<string>();
    bucket.add(routeLine);
    discoveredRoutesByScope.set(scopeId, bucket);
  }
}

/** Catálogo unificado: metadata estática + partner + rutas descubiertas en runtime. */
export function buildScopeCatalog(): NestAuthScopeMeta[] {
  const merged = new Map<string, NestAuthScopeMeta>();

  for (const entry of NEST_AUTH_SCOPE_CATALOG) {
    merged.set(String(entry.id), {
      ...entry,
      routes: [...(entry.routes ?? [])],
    });
  }

  for (const entry of partnerDeclaredScopes.values()) {
    const existing = merged.get(entry.id);
    if (existing) {
      existing.label = entry.label || existing.label;
      existing.description = entry.description || existing.description;
      existing.routes = [...new Set([...existing.routes, ...entry.routes])];
    } else {
      merged.set(entry.id, { ...entry, routes: [...entry.routes] });
    }
  }

  for (const [scopeId, routeSet] of discoveredRoutesByScope) {
    const routes = [...routeSet].sort();
    const existing = merged.get(scopeId);
    if (existing) {
      existing.routes = [...new Set([...existing.routes, ...routes])].sort();
    } else {
      merged.set(scopeId, {
        id: scopeId,
        ...defaultScopeMeta(scopeId),
        routes,
      });
    }
  }

  return [...merged.values()]
    .filter((entry) => entry.routes.length > 0 || NEST_AUTH_SCOPE_CATALOG.some((s) => s.id === entry.id))
    .sort((a, b) => {
      const aPartner = String(a.id).startsWith('partner:');
      const bPartner = String(b.id).startsWith('partner:');
      if (aPartner !== bPartner) return aPartner ? 1 : -1;
      return String(a.id).localeCompare(String(b.id));
    });
}
