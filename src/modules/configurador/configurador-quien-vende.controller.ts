import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { ConfiguradorQuienVendeService } from './configurador-quien-vende.service';
import { QuienVendeDto, QuienVendeQueryDto } from './dto/configurador-quien-vende.dto';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;

/** Configurador fase 2: quién vende el plan (mausuplan: productores, canales y gestores, incluidos o excluidos). */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador')
export class ConfiguradorQuienVendeController {
  constructor(private readonly quienVende: ConfiguradorQuienVendeService) {}

  @Get('planes/:cramo/:cplan/quien-vende/resumen')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Resumen de quién vende el plan (mausuplan) por centidad e itipouso',
    description: '{ total, grupos: [{ centidad, entidad, itipouso, filas, conTodos, editable }], avisos }. R/U/A: editable false.',
    operationId: 'configuradorQuienVendeResumen',
  })
  async resumen(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.quienVende.resumen(cramo, cplan) };
  }

  @Get('planes/:cramo/:cplan/quien-vende')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Quién vende el plan (mausuplan), paginado y con el nombre de la entidad',
    description:
      'Filtros centidad, itipouso, q (código o nombre); limit (1-500, por defecto 50) y offset. Nombre: P → maproduc, C → macanalalt, ' +
      'G → magestor (citem = cgestor). { total, limit, offset, filas: [{ id, centidad, entidad, citem, todos, nombre, itipouso, xdescripcion }] }.',
    operationId: 'configuradorQuienVende',
  })
  async listar(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Query() q: QuienVendeQueryDto) {
    return { status: true, data: await this.quienVende.listar(cramo, cplan, q) };
  }

  @Post('planes/:cramo/:cplan/quien-vende')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar quién vende el plan (mausuplan)',
    description:
      'Requiere CONFIGURADOR_QUIEN_VENDE_ESCRITURA=1 (si no, 403). { centidad: P|C|G, itipouso: A|E, items: string[] | null } ' +
      '(null = todos; no se admite excluir a todos). Valida los códigos (C: canales activos). id = MAX+1 en la transacción; ' +
      'duplicados exactos se ignoran (yaEstaban). advertencias si un item queda incluido y excluido a la vez.',
    operationId: 'configuradorAltaQuienVende',
  })
  @ApiBody({ type: QuienVendeDto })
  async alta(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: QuienVendeDto) {
    return { status: true, data: await this.quienVende.alta(cramo, cplan, dto) };
  }

  @Post('planes/:cramo/:cplan/quien-vende/baja')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Quitar quién vende el plan (borrado físico en mausuplan: la tabla no tiene iestado)',
    description:
      'Requiere CONFIGURADOR_QUIEN_VENDE_ESCRITURA=1. Mismo cuerpo que el alta; items null = la fila «todos». Responde `borradas` ' +
      '(filas completas, para el respaldo) y `noEncontrados`. 404 si no borró ninguna. R/U/A no se editan.',
    operationId: 'configuradorBajaQuienVende',
  })
  @ApiBody({ type: QuienVendeDto })
  async baja(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: QuienVendeDto) {
    return { status: true, data: await this.quienVende.baja(cramo, cplan, dto) };
  }
}
