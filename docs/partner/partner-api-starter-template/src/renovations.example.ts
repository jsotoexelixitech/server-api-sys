/**
 * Ejemplo para integradores de renovaciones (copiar a su paquete partner).
 * Requiere @jsotoexelixitech/nest-api-sdk en dependencies.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  NestPartnerProtected,
  PARTNER_RENOVATIONS_SWAGGER_TAG,
} from '@jsotoexelixitech/nest-api-sdk';

@ApiTags(PARTNER_RENOVATIONS_SWAGGER_TAG)
@Controller('v1/renovations/v2')
export class RenovationsV2Controller {
  @Post('create')
  @NestPartnerProtected('renovations:write')
  @ApiOperation({ summary: 'Renovación de póliza v2' })
  create(@Body() body: Record<string, unknown>) {
    return { status: true, received: body };
  }
}

/** Opcional — metadata en panel /admin (el host también auto-indexa /api/v1/renovations/*). */
export const renovationsPartnerScopes = [
  {
    id: 'renovations:write',
    label: 'Renovaciones v2',
    description: 'Renovación de pólizas',
    routes: ['POST /api/v1/renovations/v2/create'],
  },
];
