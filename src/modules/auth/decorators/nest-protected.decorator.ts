import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { NEST_SCOPE_KEY } from './nest-scope.decorator';

/** Scope opcional en rutas sensibles (emisión, cobranza). Auth global vía APP_GUARD. */
export function NestProtected(scope?: string) {
  const decorators = [ApiBearerAuth(), ApiSecurity('apikey')];
  if (scope) {
    decorators.unshift(SetMetadata(NEST_SCOPE_KEY, scope));
  }
  return applyDecorators(...decorators);
}
