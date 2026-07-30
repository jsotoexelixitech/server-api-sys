import { RequestMethod, Type } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { NEST_SCOPE_KEY } from '../decorators/nest-scope.decorator';
import type { DiscoveredRoute } from './scope-catalog.registry';

const HTTP_METHOD_LABELS: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.HEAD]: 'HEAD',
  [RequestMethod.OPTIONS]: 'OPTIONS',
};

function buildFullPath(
  globalPrefix: string,
  controllerPath: string,
  routeSegment: string | string[],
): string {
  const segments = [
    globalPrefix,
    controllerPath,
    ...(Array.isArray(routeSegment) ? routeSegment : [routeSegment]),
  ]
    .map((segment) => String(segment).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);

  return `/${segments.join('/')}`.replace(/\/{2,}/g, '/');
}

/** Introspección de rutas HTTP desde metadatos Nest (core + partner). */
export function discoverRoutesFromController(
  controller: Type<unknown> | Function,
  globalPrefix = 'api',
): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) ?? '';
  const classScope = Reflect.getMetadata(NEST_SCOPE_KEY, controller) as
    | string
    | undefined;

  const prototype = controller.prototype as Record<string, unknown>;
  const methodNames = Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor',
  );

  for (const methodName of methodNames) {
    const handler = prototype[methodName];
    if (typeof handler !== 'function') continue;

    const routeSegment = Reflect.getMetadata(PATH_METADATA, handler) as
      | string
      | string[]
      | undefined;
    if (routeSegment === undefined) continue;

    const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
      | RequestMethod
      | undefined;
    const httpMethod =
      HTTP_METHOD_LABELS[requestMethod ?? RequestMethod.GET] ?? 'GET';
    const handlerScope = Reflect.getMetadata(NEST_SCOPE_KEY, handler) as
      | string
      | undefined;

    routes.push({
      method: httpMethod,
      path: buildFullPath(globalPrefix, controllerPath, routeSegment),
      scopeId: handlerScope ?? classScope,
    });
  }

  return routes;
}
