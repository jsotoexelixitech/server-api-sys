import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { NestAuthGuard } from '../nest-auth.guard';

/** Emisión, cobranza y documentos: Bearer nest-api o apikey legacy. */
export function NestProtected() {
  return applyDecorators(
    UseGuards(NestAuthGuard),
    ApiBearerAuth(),
    ApiSecurity('apikey'),
  );
}
