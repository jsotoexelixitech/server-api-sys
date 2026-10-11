import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { CrearIntermediarioDto } from './dto/crear-intermediario.dto';
import { IntermediariosService } from './intermediarios.service';

@ApiTags('Intermediarios (Sis2000)')
@Controller('v1/intermediarios')
export class IntermediariosController {
  constructor(private readonly intermediarios: IntermediariosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Crear intermediario (corredor / productor)',
    description:
      'Mismo flujo que la pasarela: spCreateMaclient, spCreateMaproduc, spCreateUsuarioCorredorWeb y ' +
      'spCreateGestorWeb (cgestor_anterior NULL) en una transacción. Devuelve el código y una clave temporal.',
  })
  @ApiResponse({ status: 201, description: 'Intermediario creado.' })
  @ApiResponse({ status: 409, description: 'RIF o código de intermediario ya existente.' })
  async crear(@Body() dto: CrearIntermediarioDto) {
    const data = await this.intermediarios.crear(dto);
    return { status: true, message: 'Intermediario creado.', data };
  }
}
