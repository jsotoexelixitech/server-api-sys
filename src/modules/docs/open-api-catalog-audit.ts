import { Logger } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces';
import { pathMatchesRouteTemplate } from '../auth/scopes/nest-auth-scopes.constants';
import { buildRouteCatalog } from '../auth/scopes/scope-catalog.registry';

/** Aviso en bootstrap si el admin puede conceder rutas que OpenAPI no documentó. */
export function warnCatalogRoutesMissingFromOpenApi(
  document: OpenAPIObject,
  log: Logger,
): void {
  const pathKeys = Object.keys(document.paths ?? {});
  if (!pathKeys.length) return;

  const warned = new Set<string>();

  for (const entry of buildRouteCatalog()) {
    if (!String(entry.scopeId).startsWith('partner:')) continue;

    const space = entry.routeId.indexOf(' ');
    if (space <= 0) continue;

    const pathFromCatalog = entry.routeId.slice(space + 1).trim();
    const hasOpenApiPath = pathKeys.some((key) =>
      pathMatchesRouteTemplate(key, pathFromCatalog),
    );

    if (!hasOpenApiPath && !warned.has(entry.routeId)) {
      warned.add(entry.routeId);
      log.warn(
        `Swagger: catálogo admin sin OpenAPI (${entry.routeId}) — docs filtrados usan stub; el paquete partner debe añadir @ApiOperation`,
      );
    }
  }
}
