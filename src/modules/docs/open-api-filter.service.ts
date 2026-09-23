import { Injectable, NotFoundException } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces';
import {
  canonicalizePathTemplate,
  explicitRouteGrantMatches,
  grantMatchesRoute,
  pathMatchesRouteTemplate,
} from '../auth/scopes/nest-auth-scopes.constants';
import {
  buildRouteCatalog,
  buildScopeCatalog,
  expandGrantsToRoutes,
  inferScopeFromPath,
} from '../auth/scopes/scope-catalog.registry';
import { describeRouteLine } from '../auth/scopes/route-descriptions';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { OpenApiDocumentStore } from './open-api-document.store';
import { pruneOpenApiComponents } from './prune-openapi-components';

/** Todos los verbos OpenAPI — no omitir put/patch (Swagger individual). */
const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
]);

const ALWAYS_VISIBLE_PREFIXES = [
  '/api/v1/auth/token',
  '/api/v1/auth/refresh',
];

const ALWAYS_HIDDEN_PREFIXES = ['/api/v1/admin'];

@Injectable()
export class OpenApiFilterService {
  constructor(private readonly store: OpenApiDocumentStore) {}

  filterByScopes(grantedScopes: string[], keyName?: string): OpenAPIObject {
    const source = this.store.getDocument();
    const scopeIndex = this.buildRouteScopeIndex();
    const filteredPaths: NonNullable<OpenAPIObject['paths']> = {};
    const visibleTags = new Set<string>();

    for (const [pathKey, pathItem] of Object.entries(source.paths ?? {})) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      if (this.isAlwaysHidden(pathKey)) continue;

      const nextPathItem: Record<string, unknown> = {};
      let hasHttpOp = false;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(method)) {
          nextPathItem[method] = operation;
          continue;
        }
        if (!operation || typeof operation !== 'object') continue;

        if (
          this.isAlwaysVisible(pathKey) ||
          this.canViewOperation(grantedScopes, method, pathKey, scopeIndex)
        ) {
          nextPathItem[method] = operation;
          hasHttpOp = true;
          const tags = (operation as { tags?: string[] }).tags;
          tags?.forEach((tag) => visibleTags.add(tag));
        }
      }

      if (hasHttpOp) {
        filteredPaths[pathKey] = nextPathItem as typeof pathItem;
      }
    }

    this.appendGrantedCatalogRoutes(
      grantedScopes,
      source,
      filteredPaths,
      visibleTags,
    );

    const titleSuffix = keyName ? ` — ${keyName}` : '';
    const components = pruneOpenApiComponents(source.components, [
      filteredPaths,
    ]);

    return {
      ...source,
      info: {
        ...source.info,
        title: `${source.info?.title ?? 'nest-api'}${titleSuffix}`,
        description:
          'Documentación filtrada según los scopes de su token. Solo aparecen los endpoints autorizados y sus schemas.',
      },
      paths: filteredPaths,
      tags: (source.tags ?? []).filter((tag) => visibleTags.has(tag.name)),
      components,
    };
  }

  private buildRouteScopeIndex(): Map<string, string> {
    const index = new Map<string, string>();
    for (const entry of buildScopeCatalog()) {
      for (const route of entry.routes) {
        const space = route.indexOf(' ');
        if (space <= 0) continue;
        const method = route.slice(0, space).toUpperCase();
        const path = canonicalizePathTemplate(route.slice(space + 1));
        index.set(`${method} ${path}`, String(entry.id));
      }
    }
    return index;
  }

  private canViewOperation(
    grantedScopes: string[],
    method: string,
    pathKey: string,
    scopeIndex: Map<string, string>,
  ): boolean {
    const normalizedPath = this.normalizePath(pathKey);
    const lookupKey = `${method.toUpperCase()} ${canonicalizePathTemplate(normalizedPath)}`;
    const requiredScope =
      scopeIndex.get(lookupKey) ?? inferScopeFromPath(normalizedPath);

    if (!requiredScope) {
      return explicitRouteGrantMatches(
        grantedScopes,
        method,
        normalizedPath,
      );
    }
    return grantMatchesRoute(
      grantedScopes,
      method,
      normalizedPath,
      requiredScope,
    );
  }

  /**
   * Rutas concedidas en la key (líneas METHOD /path o scopes expandidos) que no
   * están en OpenAPI o no pasaron el primer filtro — p. ej. partner sin @ApiOperation
   * o catálogo runtime distinto al momento de crear la key.
   */
  private appendGrantedCatalogRoutes(
    grantedScopes: string[],
    source: OpenAPIObject,
    filteredPaths: NonNullable<OpenAPIObject['paths']>,
    visibleTags: Set<string>,
  ): void {
    if (!grantedScopes?.length) return;

    const catalog = buildRouteCatalog();
    const seen = new Set<string>();

    for (const routeLine of this.collectGrantedRouteLines(grantedScopes)) {
      const space = routeLine.indexOf(' ');
      if (space <= 0) continue;

      const method = routeLine.slice(0, space).toLowerCase();
      if (!HTTP_METHODS.has(method)) continue;

      const pathKey = this.normalizePath(routeLine.slice(space + 1));
      const dedupeKey = `${method.toUpperCase()} ${pathKey}`;
      if (seen.has(dedupeKey)) continue;

      const catalogEntry = catalog.find((entry) => {
        const routeSpace = entry.routeId.indexOf(' ');
        if (routeSpace <= 0) return false;
        const entryMethod = entry.routeId.slice(0, routeSpace).toLowerCase();
        const entryPath = entry.routeId.slice(routeSpace + 1);
        return (
          entryMethod === method &&
          pathMatchesRouteTemplate(entryPath, pathKey)
        );
      });

      const scopeId =
        catalogEntry?.scopeId ?? inferScopeFromPath(pathKey);
      const allowed = scopeId
        ? grantMatchesRoute(grantedScopes, method, pathKey, scopeId)
        : explicitRouteGrantMatches(grantedScopes, method, pathKey);
      if (!allowed) continue;

      seen.add(dedupeKey);

      const existingItem = filteredPaths[pathKey];
      if (
        existingItem &&
        typeof existingItem === 'object' &&
        (existingItem as Record<string, unknown>)[method]
      ) {
        continue;
      }

      const sourcePathKey = this.resolveSourcePathKey(source.paths, pathKey);
      const sourceItem = sourcePathKey ? source.paths?.[sourcePathKey] : undefined;
      const fromDoc =
        sourceItem && typeof sourceItem === 'object'
          ? (sourceItem as Record<string, unknown>)[method]
          : undefined;

      const isPartner = /\/api\/v1\/partner\//i.test(pathKey);
      const operation =
        fromDoc && typeof fromDoc === 'object'
          ? fromDoc
          : {
              tags: [
                isPartner
                  ? SWAGGER_TAGS.PARTNER
                  : (catalogEntry?.scopeLabel ?? 'API'),
              ],
              summary:
                catalogEntry?.description ?? describeRouteLine(routeLine),
              description:
                catalogEntry?.scopeDescription ??
                'Endpoint autorizado para esta API key.',
              responses: { '200': { description: 'Respuesta exitosa' } },
            };

      const nextItem = {
        ...(existingItem && typeof existingItem === 'object' ? existingItem : {}),
        [method]: operation,
      };
      filteredPaths[pathKey] = nextItem as NonNullable<
        OpenAPIObject['paths']
      >[string];

      const tags = (operation as { tags?: string[] }).tags;
      tags?.forEach((tag) => visibleTags.add(tag));
    }
  }

  private collectGrantedRouteLines(grantedScopes: string[]): string[] {
    const lines = new Set<string>();
    for (const grant of grantedScopes) {
      const trimmed = String(grant ?? '').trim();
      if (trimmed.includes(' ')) lines.add(trimmed);
    }
    for (const route of expandGrantsToRoutes(grantedScopes)) {
      lines.add(route);
    }
    return [...lines].sort();
  }

  private resolveSourcePathKey(
    paths: OpenAPIObject['paths'] | undefined,
    normalizedPath: string,
  ): string | undefined {
    if (!paths) return undefined;
    if (paths[normalizedPath]) return normalizedPath;
    for (const key of Object.keys(paths)) {
      if (pathMatchesRouteTemplate(key, normalizedPath)) return key;
    }
    return undefined;
  }

  private isAlwaysVisible(path: string): boolean {
    const normalized = this.normalizePath(path);
    return ALWAYS_VISIBLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

  private isAlwaysHidden(path: string): boolean {
    const normalized = this.normalizePath(path);
    return ALWAYS_HIDDEN_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }

  private normalizePath(path: string): string {
    const withLeading = path.startsWith('/') ? path : `/${path}`;
    return withLeading.replace(/\/{2,}/g, '/');
  }
}

export class DocsViewNotFoundError extends NotFoundException {
  constructor() {
    super('Enlace de documentación inválido o token revocado.');
  }
}
