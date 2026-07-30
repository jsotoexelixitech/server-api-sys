import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { NestAuthGuard } from '../nest-auth.guard';
import { NEST_SCOPE_KEY } from './nest-scope.decorator';

/** Emisión, cobranza y documentos: Bearer nest-api o apikey legacy. */
export function NestProtected(scope?: string) {
  const decorators = [
    UseGuards(NestAuthGuard),
    ApiBearerAuth(),
    ApiSecurity('apikey'),
  ];
  if (scope) {
    decorators.unshift(SetMetadata(NEST_SCOPE_KEY, scope));
  }
  return applyDecorators(...decorators);
}
