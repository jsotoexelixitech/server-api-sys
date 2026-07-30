import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { registerDiscoveredRoutes } from './scope-catalog.registry';
import { discoverRoutesFromController } from './scope-route-discovery';

const bootstrapLog = new Logger('ScopeCatalog');

@Injectable()
export class ScopeCatalogBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly modulesContainer: ModulesContainer) {}

  onApplicationBootstrap(): void {
    let routeCount = 0;

    for (const moduleRef of this.modulesContainer.values()) {
      for (const controller of moduleRef.controllers.values()) {
        const { metatype } = controller;
        if (!metatype) continue;

        const routes = discoverRoutesFromController(metatype);
        if (routes.length > 0) {
          registerDiscoveredRoutes(routes);
          routeCount += routes.length;
        }
      }
    }

    bootstrapLog.log(
      `Catálogo de scopes actualizado (${routeCount} rutas core/partner/admin indexadas)`,
    );
  }
}
