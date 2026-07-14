import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PersonasService } from '../personas/personas.service';
import { CreateEmissionPersonDto } from '../personas/dto/create-emission-person.dto';
import { ValidateEmissionPersonDto } from '../emissions/dto/validate-emission-person.dto';
import { Api401, Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiExcludeController()
@ApiTags('Emisión Personas (Funerario)')
@Controller('v1/external')
export class ExternalController {
  constructor(private readonly personasService: PersonasService) {}

  @Post('validateEmissionPerson')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar emisión de personas',
    description: 'Valida los datos antes de emitir. Actualmente es un paso de paso que devuelve status: true si los datos están correctos según el DTO.',
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
  @ApiOperation({
    summary: 'Emitir póliza de personas (Funerario) - Interfaz externa',
    description: 'Inserta en la vista `eePoliza_Personas_General`. Requiere header `apikey`.',
  })
  @ApiHeader({ name: 'apikey', description: 'Token de autenticación del canal emisor (opcional en QA interno)', required: false })
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
