import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
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

@ApiTags('6. Emisión Funerario (personas)')
@Controller('v1/external')
export class ExternalController {
  constructor(private readonly personasService: PersonasService) {}

  @Post('getCotizacionPer')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('apikey')
  @ApiOperation({
    summary: 'Funerario paso 4 · Cotización de personas',
    description:
      'Ejecuta `spCalculoPer` por cada asegurado. Formato legacy SysIP (`result.data` + `total_extension`).\n\n' +
      '**Flujo funerario (fb_organizacion_swagger):**\n' +
      '1. `POST /valrep/productos` → 2. `POST /valrep/planes/producto` → 3. `POST /valrep/planes/detalle` → ' +
      '**4. este endpoint** → 5. `validateEmissionPerson` → 6. `createEmissionPerson`.\n\n' +
      'Equivalente interno Exélixi: `POST /personas/cotizacion` (formato plano).',
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
  async getCotizacionPer(
    @Headers('apikey') _apikey: string,
    @Body() dto: CotizacionPerDto,
  ) {
    const result = await this.personasService.buildCotizacionPerLegacyResult(dto);
    return { status: true, result };
  }

  @Post('validateEmissionPerson')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Funerario paso 5 · Validar emisión de personas',
    description:
      'Ejecuta `speeValidatePersonGeneral` antes de emitir. ' +
      'Paso previo a `POST /external/createEmissionPerson`.',
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
  @ApiSecurity('apikey')
  @ApiOperation({
    summary: 'Funerario paso 6 · Emitir póliza de personas',
    description:
      'Ejecuta `sp_pre_emision_personas_general_nexus` → `sp_emision_personas_general_nexus` (QA Nexus; legacy SysIP: `sp_pre_emision_Personas_General`). ' +
      'Requiere header `apikey` en producción.',
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
  async createEmissionPerson(@Headers('apikey') apikey: string, @Body() dto: CreateEmissionPersonDto) {
    const result = await this.personasService.createEmissionPerson(apikey ?? '', dto);
    return { status: true, result };
  }
}
