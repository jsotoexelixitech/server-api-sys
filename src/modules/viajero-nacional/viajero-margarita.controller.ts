import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Api401, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NestApiKey } from '../auth/decorators/nest-api-key.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { EmitViaje3Dto } from './dto/emit-viaje3.dto';
import { ViajeroNacionalService } from './viajero-nacional.service';
import { VIAJERO_MARGARITA } from './viajero-nacional.constants';

@ApiTags('Viajero 7 días')
@Controller('v1/viajero-7-dias')
export class ViajeroMargaritaController {
  constructor(private readonly svc: ViajeroNacionalService) {}

  @Post('emision')
  @HttpCode(HttpStatus.OK)
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_PERSON)
  @ApiOperation({
    summary: 'Emitir viajero 7 días',
    description: 'Emisión personas. Ramo, plan y vigencia de 7 días los fija el servidor.',
    operationId: 'viajero7DiasEmision',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: EmitViaje3Dto })
  @Api401()
  @ApiCommonErrors()
  async emitir(@NestApiKey() apikey: string, @Body() dto: EmitViaje3Dto) {
    const result = await this.svc.emitir(apikey ?? '', dto, VIAJERO_MARGARITA);
    return { status: true, result };
  }
}
