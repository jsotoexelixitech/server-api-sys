import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  EXELIXI_PARTNER_HOST,
  ExelixiPartnerHost,
  PARTNER_SWAGGER_TAG,
} from '@jsotoexelixitech/nest-api-sdk';

@ApiTags(PARTNER_SWAGGER_TAG)
@Controller('v1/partner/starter')
export class PartnerStarterController {
  constructor(
    @Inject(EXELIXI_PARTNER_HOST)
    private readonly host: ExelixiPartnerHost,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Health del módulo partner (plantilla)',
    description:
      'Ejemplo para integradores. Renombrar controlador/rutas en su paquete npm.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { status: true, module: '@exelixi/partner-api-starter', env: 'development' },
    },
  })
  health() {
    this.host.log('log', 'GET /partner/starter/health', 'PartnerStarter');
    return {
      status: true,
      module: '@exelixi/partner-api-starter',
      env: this.host.getConfig('NODE_ENV') ?? 'unknown',
    };
  }
}
