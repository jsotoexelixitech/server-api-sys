import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { CrearIntermediarioDto } from './dto/crear-intermediario.dto';
import { CrearCanalDto } from './dto/crear-canal.dto';
import { CrearGestorDto } from './dto/crear-gestor.dto';
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

  @Post('canal')
  @HttpCode(HttpStatus.CREATED)
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Crear canal Alterno o Directo con su gestor',
    description: 'Como la agencia master A/D de la pasarela: spCreateCanal y spCreateGestorWeb (padre 80080) en una transacción.',
  })
  @ApiResponse({ status: 201, description: 'Canal creado.' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado como gestor.' })
  async crearCanal(@Body() dto: CrearCanalDto) {
    const data = await this.intermediarios.crearCanal(dto);
    return { status: true, message: 'Canal creado.', data };
  }

  @Post('gestor')
  @HttpCode(HttpStatus.CREATED)
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Crear agencia o asesor (gestor hijo de otro gestor)',
    description: 'Hereda tipo de canal, canal y subcanal del gestor padre; spCreateGestorWeb con cgestor_anterior = padre.',
  })
  @ApiResponse({ status: 201, description: 'Gestor creado.' })
  @ApiResponse({ status: 404, description: 'Gestor padre inexistente.' })
  @ApiResponse({ status: 409, description: 'Correo ya registrado como gestor.' })
  async crearGestor(@Body() dto: CrearGestorDto) {
    const data = await this.intermediarios.crearGestor(dto);
    return { status: true, message: 'Gestor creado.', data };
  }

  @Get('gestores')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({ summary: 'Buscar gestores (posibles padres) por código, nombre o correo' })
  @ApiQuery({ name: 'q', required: true, description: 'Mínimo 2 caracteres' })
  async buscarGestores(@Query('q') q: string) {
    const data = await this.intermediarios.buscarGestores(q);
    return { status: true, data };
  }
}
