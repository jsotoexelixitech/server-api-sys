import type { PartnerScopeMeta } from '@jsotoexelixitech/nest-api-sdk';
import {
  canonicalizePathTemplate,
  NEST_AUTH_SCOPE_CATALOG,
  NestAuthScopeMeta,
} from './nest-auth-scopes.constants';
import { describeRouteLine } from './route-descriptions';

export interface DiscoveredRoute {
  method: string;
  path: string;
  scopeId?: string;
}

export interface RouteCatalogEntry {
  routeId: string;
  scopeId: string;
  scopeLabel: string;
  /** Descripción del módulo/scope (agrupación). */
  scopeDescription: string;
  /** Descripción específica del endpoint. */
  description: string;
}

/** Prefijos /api/v1/* que no deben generar scope automático (auth público, docs, etc.). */
const SCOPE_INFER_SKIP_SEGMENTS = new Set([
  'auth',
  'docs',
  'app',
  'health',
  'admin',
]);

/** Scope inferido por prefijo de ruta (core, partner, admin). */
export function inferScopeFromPath(normalizedPath: string): string | undefined {
  const path = normalizedPath.replace(/\/{2,}/g, '/');

  const partnerMatch = path.match(/\/api\/v1\/partner\/([^/]+)/i);
  if (partnerMatch) return `partner:${partnerMatch[1]}`;

  if (/\/api\/v1\/renovations\//i.test(path)) {
    return 'renovations:write';
  }

  if (/\/api\/v1\/admin\/(keys|scopes)/i.test(path)) {
    return 'admin:keys';
  }

  if (/\/api\/v1\/auth\//i.test(path)) return undefined;

  if (/\/api\/v1\/client\//i.test(path)) return 'client:read';
  if (/\/api\/v1\/product-emission\//i.test(path)) return 'product-emission:write';
  if (/\/api\/v1\/external\/collection\//i.test(path)) return 'collection:write';
  if (/\/api\/v1\/documents\//i.test(path)) return 'documents:write';
  if (/\/api\/v1\/condominio\//i.test(path)) return 'emissions:condominio';
  if (/\/api\/v1\/personas\//i.test(path)) return 'emissions:person';
  if (/\/api\/v1\/emision-personas\//i.test(path)) return 'emissions:person';
  // Partner Gestacio (y legacy) conserva /external/* personas
  if (/\/api\/v1\/external\/(?:getCotizacionPer|validateEmissionPerson|createEmissionPerson)/i.test(path)) {
    return 'emissions:person';
  }
  if (/\/api\/v1\/external\/(?:validateEmissionAuto|createEmissionAuto)/i.test(path)) {
    return 'emissions:auto';
  }
  if (/\/api\/v1\/emissions\//i.test(path)) return 'emissions:auto';
  if (/\/api\/v1\/valrep\//i.test(path)) return 'catalog:read';
  if (/\/api\/v1\/canal\//i.test(path)) return 'catalog:read';
  if (/\/api\/v1\/inma\//i.test(path)) return 'catalog:read';
  if (/\/api\/(?:v1\/)?endosos\//i.test(path)) return 'endosos:write';
  if (/\/api\/v1\/report\//i.test(path)) return 'report:write';

  // Fallback: cualquier otro /api/v1/{segment}/... → {segment}:write
  // (partners o módulos nuevos sin entrada fija; evita que queden fuera del admin)
  const segmentMatch = path.match(/^\/api\/v1\/([^/]+)\//i);
  if (segmentMatch) {
    const segment = segmentMatch[1].toLowerCase();
    if (!SCOPE_INFER_SKIP_SEGMENTS.has(segment)) {
      return `${segment}:write`;
    }
  }

  return undefined;
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
  if (scopeId === 'renovations:write') {
    return {
      label: 'Renovaciones',
      description: 'Endpoints bajo /api/v1/renovations/ (integradores partner)',
    };
  }

  if (scopeId.startsWith('partner:')) {
    const slug = scopeId.slice('partner:'.length);
    return {
      label: `Partner: ${slug}`,
      description: `Endpoints bajo /api/v1/partner/${slug}/`,
    };
  }

  if (scopeId === 'catalog:read') {
    return {
      label: 'Catálogos INMA / valrep',
      description: 'Consultas de catálogo vehicular y tarifario RCV',
    };
  }

  if (scopeId === 'endosos:write') {
    return {
      label: 'Endosos',
      description: 'Endpoints bajo /api/endosos/ o /api/v1/endosos/',
    };
  }

  if (scopeId === 'report:write') {
    return {
      label: 'Reportes',
      description: 'Reportes partner bajo /api/v1/report/',
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
      scopeId = inferScopeFromPath(normalizedPath);
      if (!scopeId) continue;
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

/** Catálogo plano: una fila por endpoint protegido (sin agrupar por scope en UI). */
export function buildRouteCatalog(): RouteCatalogEntry[] {
  const entries: RouteCatalogEntry[] = [];
  for (const scope of buildScopeCatalog()) {
    if (scope.id === 'admin:keys') continue;
    for (const routeId of scope.routes) {
      entries.push({
        routeId,
        scopeId: String(scope.id),
        scopeLabel: scope.label,
        scopeDescription: scope.description,
        description: describeRouteLine(routeId),
      });
    }
  }
  return entries.sort((a, b) => a.routeId.localeCompare(b.routeId));
}

/** Expande scopes legacy (`emissions:person`) a rutas; conserva grants por ruta. */
export function expandGrantsToRoutes(grants: string[]): string[] {
  const scopeById = new Map(buildScopeCatalog().map((entry) => [String(entry.id), entry]));
  const routeByCanon = new Map<string, string>();
  for (const entry of buildRouteCatalog()) {
    const space = entry.routeId.indexOf(' ');
    if (space <= 0) continue;
    const method = entry.routeId.slice(0, space).toUpperCase();
    const path = canonicalizePathTemplate(entry.routeId.slice(space + 1));
    routeByCanon.set(`${method} ${path}`, entry.routeId);
  }
  const expanded = new Set<string>();

  for (const raw of grants ?? []) {
    const grant = String(raw ?? '').trim();
    if (!grant) continue;
    if (grant.includes(' ')) {
      const space = grant.indexOf(' ');
      const method = grant.slice(0, space).toUpperCase();
      const path = canonicalizePathTemplate(grant.slice(space + 1));
      const known = routeByCanon.get(`${method} ${path}`);
      if (known) {
        expanded.add(known);
        continue;
      }
    }
    const scope = scopeById.get(grant);
    if (scope) {
      for (const routeId of scope.routes) expanded.add(routeId);
    }
  }

  return [...expanded].sort();
}
