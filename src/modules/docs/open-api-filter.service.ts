import { Injectable, NotFoundException } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces';
import { grantMatchesRoute } from '../auth/scopes/nest-auth-scopes.constants';
import {
  buildScopeCatalog,
  inferScopeFromPath,
} from '../auth/scopes/scope-catalog.registry';
import { OpenApiDocumentStore } from './open-api-document.store';
import { pruneOpenApiComponents } from './prune-openapi-components';

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
          const tags = (operation as { tags?: string[] }).tags;
          tags?.forEach((tag) => visibleTags.add(tag));
        }
      }

      if (Object.keys(nextPathItem).length > 0) {
        filteredPaths[pathKey] = nextPathItem as typeof pathItem;
      }
    }

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
        const path = this.normalizePath(route.slice(space + 1));
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
    const lookupKey = `${method.toUpperCase()} ${normalizedPath}`;
    const requiredScope =
      scopeIndex.get(lookupKey) ?? inferScopeFromPath(normalizedPath);

    if (!requiredScope) return true;
    return grantMatchesRoute(
      grantedScopes,
      method,
      normalizedPath,
      requiredScope,
    );
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
