import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { ConfiguradorFrecuenciasService } from './configurador-frecuencias.service';
import {
  BajaFrecuenciaProductorQueryDto, EditarFrecuenciaPlanDto, FrecuenciaPlanDto, FrecuenciaProductorDto,
} from './dto/configurador-frecuencias.dto';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;

/** Configurador fase 2: frecuencias de pago del plan (maplanes_frec) y del productor (maplanes_frec_produc). */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador')
export class ConfiguradorFrecuenciasController {
  constructor(private readonly frecuencias: ConfiguradorFrecuenciasService) {}

  @Get('planes/:cramo/:cplan/frecuencias')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Frecuencias de pago del plan (maplanes_frec)',
    description: "Todas las filas del plan (V, I y las N/A heredadas de Sis2000), 'V' primero.",
    operationId: 'configuradorFrecuenciasPlan',
  })
  async listar(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.frecuencias.listar(cramo, cplan) };
  }

  @Post('planes/:cramo/:cplan/frecuencias')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar una frecuencia al plan (maplanes_frec)',
    description:
      'Requiere CONFIGURADOR_FRECUENCIAS_ESCRITURA=1 (si no, 403). Letras A/S/T/C/M/E/K/D (mayúscula); ndias obligatorio en D. ' +
      "409 si ya hay una fila 'V' con la misma llave (letra + ndias, NULL = 0); si la llave está en 'I' se reactiva (accion: 'reactivada').",
    operationId: 'configuradorCrearFrecuenciaPlan',
  })
  @ApiBody({ type: FrecuenciaPlanDto })
  async crear(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: FrecuenciaPlanDto) {
    return { status: true, data: await this.frecuencias.crear(cramo, cplan, dto) };
  }

  @Patch('planes/:cramo/:cplan/frecuencias/:ifrecuencia')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Editar una frecuencia del plan (xfrecuencia, ndias o iestado V/I)',
    description:
      'Requiere CONFIGURADOR_FRECUENCIAS_ESCRITURA=1. `ndias` identifica la fila si la letra tiene varias; el nuevo valor va en `ndiasNuevo`. ' +
      "409 si quedarían dos filas 'V' con la misma llave. Devuelve { antes, despues }.",
    operationId: 'configuradorEditarFrecuenciaPlan',
  })
  @ApiBody({ type: EditarFrecuenciaPlanDto })
  async editar(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('cplan') cplan: string,
    @Param('ifrecuencia') ifrecuencia: string,
    @Body() dto: EditarFrecuenciaPlanDto,
  ) {
    return { status: true, data: await this.frecuencias.editar(cramo, cplan, ifrecuencia, dto) };
  }

  @Get('planes/:cramo/:cplan/frecuencias-productor')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Frecuencias propias de productores en el plan (maplanes_frec_produc)', operationId: 'configuradorFrecuenciasProductor' })
  async listarProductor(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.frecuencias.listarProductor(cramo, cplan) };
  }

  @Post('planes/:cramo/:cplan/frecuencias-productor')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar una frecuencia propia de un productor (maplanes_frec_produc)',
    description: 'Requiere CONFIGURADOR_FRECUENCIAS_ESCRITURA=1. El productor debe existir en maproduc; 409 si ya tiene esa letra y ndias. Avisa si el plan no tiene la letra vigente.',
    operationId: 'configuradorCrearFrecuenciaProductor',
  })
  @ApiBody({ type: FrecuenciaProductorDto })
  async crearProductor(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: FrecuenciaProductorDto) {
    return { status: true, data: await this.frecuencias.crearProductor(cramo, cplan, dto) };
  }

  @Delete('planes/:cramo/:cplan/frecuencias-productor/:cproductor/:ifrecuencia')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Borrar la frecuencia de un productor (borrado físico: la tabla no tiene iestado)',
    description: 'Requiere CONFIGURADOR_FRECUENCIAS_ESCRITURA=1. ?ndias= borra solo esa fila; sin él, todas las de la letra. Responde `borradas` (respaldo). 404 si no hay.',
    operationId: 'configuradorBorrarFrecuenciaProductor',
  })
  async borrarProductor(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('cplan') cplan: string,
    @Param('cproductor', ParseIntPipe) cproductor: number,
    @Param('ifrecuencia') ifrecuencia: string,
    @Query() q: BajaFrecuenciaProductorQueryDto,
  ) {
    return { status: true, data: await this.frecuencias.borrarProductor(cramo, cplan, cproductor, ifrecuencia, q.ndias) };
  }
}
