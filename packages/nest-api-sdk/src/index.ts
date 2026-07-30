import { applyDecorators, DynamicModule, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';

/** Metadata key compartida con nest-auth.guard del host. */
export const NEST_SCOPE_KEY = 'nest:scope';

/** Token de inyección del host Exélixi (config acotada, logging). */
export const EXELIXI_PARTNER_HOST = Symbol('EXELIXI_PARTNER_HOST');

/** Superficie mínima expuesta al partner — sin servicios internos del core. */
export interface ExelixiPartnerHost {
  getConfig(key: string): string | undefined;
  log(level: 'log' | 'warn' | 'error', message: string, context?: string): void;
}

export interface PartnerModuleRegisterOptions {
  host?: ExelixiPartnerHost;
}

export type PartnerModuleFactory = (
  options?: PartnerModuleRegisterOptions,
) => DynamicModule;

/** Scope otorgable en el panel admin del host (catálogo dinámico). */
export interface PartnerScopeMeta {
  id: string;
  label: string;
  description: string;
  routes: string[];
}

/** Cada paquete npm partner debe exportar `register`. Opcional: `partnerScopes`. */
export interface PartnerPackageExports {
  register: PartnerModuleFactory;
  partnerScopes?: PartnerScopeMeta[];
}

/**
 * Protege un endpoint partner con scope (Bearer/apikey + permiso en la key).
 * Sin este decorador la ruta solo requiere token válido.
 */
export function NestPartnerProtected(scope: string) {
  return applyDecorators(
    SetMetadata(NEST_SCOPE_KEY, scope),
    ApiBearerAuth(),
    ApiSecurity('apikey'),
  );
}

/** Tag Swagger unificado para integraciones externas. */
export const PARTNER_SWAGGER_TAG = '8. Integraciones partner';
