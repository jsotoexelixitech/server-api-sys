import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PersonasService } from '../personas/personas.service';
import { CreateEmissionPersonDto } from '../personas/dto/create-emission-person.dto';
import { Api401, Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiTags('external')
@Controller('v1/external')
export class ExternalController {
  constructor(private readonly personasService: PersonasService) {}

  @Post('validateEmissionPerson')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar emisión de personas',
    description: 'Valida los datos antes de emitir. Actualmente es un paso de paso que devuelve status: true si los datos están correctos según el DTO.',
  })
  @ApiHeader({ name: 'apikey', description: 'Token de autenticación del canal emisor', required: true })
  @ApiBody({ type: CreateEmissionPersonDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, result: { message: 'Validación exitosa.' } } },
  })
  @ApiCommonErrors()
  async validateEmissionPerson(@Headers('apikey') apikey: string, @Body() dto: CreateEmissionPersonDto) {
    // Si llega aquí, el DTO es válido por las validaciones de clase.
    // Futuro: Validar límites de edad, suma asegurada vs plan, etc.
    return { status: true, result: { message: 'Validación exitosa.' } };
  }

  @Post('createEmissionPerson')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Emitir póliza de personas (Funerario) - Interfaz externa',
    description: 'Inserta en la vista `eePoliza_Personas_General`. Requiere header `apikey`.',
  })
  @ApiHeader({ name: 'apikey', description: 'Token de autenticación del canal emisor', required: true })
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
