import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PersonasService } from '../personas/personas.service';
import { CreateEmissionPersonDto } from '../personas/dto/create-emission-person.dto';
import { CotizacionPerDto } from '../personas/dto/cotizacion-per.dto';
import { ValidateEmissionPersonDto } from '../emissions/dto/validate-emission-person.dto';
import { Api401, Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NestApiKey } from '../auth/decorators/nest-api-key.decorator';

@ApiTags('6. Emisión personas')
@Controller('v1/external')
export class ExternalController {
  constructor(private readonly personasService: PersonasService) {}

  @Post('getCotizacionPer')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('apikey')
  @ApiOperation({
    summary: 'Funerario paso 4 · Cotización de personas',
    description:
      'Cotización de personas con desglose por asegurado y totales de extensión.\n\n' +
      '**Flujo recomendado:** productos → planes/producto → planes/detalle → cotización → validación → emisión.',
    operationId: 'funerarioExternalGetCotizacionPer',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: CotizacionPerDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        result: {
          data: [{ total_asegurado: [{ mprima: 12178.03, mprimaext: 16.78 }] }],
          total_extension: { mprimatotal: 12178.03, mprimatotalext: 16.78 },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos o prima cero.' })
  @Api401()
  @ApiCommonErrors()
  async getCotizacionPer(@Body() dto: CotizacionPerDto) {
    const result = await this.personasService.buildCotizacionPerLegacyResult(dto);
    return { status: true, result };
  }

  @Post('validateEmissionPerson')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Funerario paso 5 · Validar emisión de personas',
    description: 'Valida reglas de negocio antes de emitir. Paso previo a `POST /external/createEmissionPerson`.',
    operationId: 'funerarioExternalValidateEmissionPerson',
  })
  @ApiBody({ type: ValidateEmissionPersonDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, result: { status: true, message: 'Persona válida para emisión.' } } },
  })
  @ApiResponse({
    status: 200,
    description: 'Validación rechazada por regla de negocio (status: false)',
    schema: { example: { status: false, result: { status: false, error: 'Se ha detectado la existencia de una póliza vigente con el mismo asegurado y ramo.' } } },
  })
  @ApiCommonErrors()
  async validateEmissionPerson(@Body() dto: ValidateEmissionPersonDto) {
    const result = await this.personasService.validateEmissionPerson(dto as unknown as Record<string, unknown>);
    return { status: result.status, result };
  }

  @Post('createEmissionPerson')
  @HttpCode(HttpStatus.OK)
  @NestProtected()
  @ApiOperation({
    summary: 'Funerario paso 6 · Emitir póliza de personas',
    description: 'Emite la póliza de personas. Requiere clave de API en entornos públicos.',
    operationId: 'funerarioExternalCreateEmissionPerson',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: CreateEmissionPersonDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, result: { message: 'Emisión registrada exitosamente.', cnpoliza: '9-1-0000001234', cnrecibo: '9-100012345' } } },
  })
  @Api401()
  @ApiCommonErrors()
  async createEmissionPerson(@NestApiKey() apikey: string, @Body() dto: CreateEmissionPersonDto) {
    const result = await this.personasService.createEmissionPerson(apikey ?? '', dto);
    return { status: true, result };
  }
}
