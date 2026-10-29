import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfiguradorService } from './configurador.service';
import {
  CrearCoberturaDto, CrearDetalleTarifaDto, CrearTablaEdadDto, CrearTarifaDto, EditarCoberturaDto, EditarTarifaDto, PlanDto,
  RamoQueryDto, TarifasQueryDto, TramosEdadDto,
} from './dto/configurador.dto';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;

/** Configurador de productos y planes en Sis2000 (proyecto-product-builder). Todo requiere `configurador:write`. */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador')
export class ConfiguradorController {
  constructor(private readonly service: ConfiguradorService) {}

  // ── Coberturas ─────────────────────────────────────────────────────────────

  @Get('coberturas')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Coberturas de un ramo (macoberturas)', operationId: 'configuradorCoberturas' })
  async coberturas(@Query() q: RamoQueryDto) {
    return { status: true, data: await this.service.listarCoberturas(q.cramo) };
  }

  @Post('coberturas')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Crear cobertura', operationId: 'configuradorCrearCobertura' })
  @ApiBody({ type: CrearCoberturaDto })
  async crearCobertura(@Body() dto: CrearCoberturaDto) {
    return { status: true, data: await this.service.crearCobertura(dto) };
  }

  @Patch('coberturas/:cramo/:ccobertura')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Editar o inactivar cobertura (iestado I)', operationId: 'configuradorEditarCobertura' })
  async editarCobertura(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('ccobertura') ccobertura: string,
    @Body() dto: EditarCoberturaDto,
  ) {
    return { status: true, data: await this.service.editarCobertura(cramo, ccobertura, dto) };
  }

  // ── Tarifas ────────────────────────────────────────────────────────────────

  @Get('tarifas')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Tarifas de una cobertura con sus tasas por vigencia', operationId: 'configuradorTarifas' })
  async tarifas(@Query() q: TarifasQueryDto) {
    return { status: true, data: await this.service.listarTarifas(q.cramo, q.ccober) };
  }

  @Post('tarifas')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Crear tarifa (matarifa) con sus tasas (matarifa_d) en una transacción', operationId: 'configuradorCrearTarifa' })
  @ApiBody({ type: CrearTarifaDto })
  async crearTarifa(@Body() dto: CrearTarifaDto) {
    return { status: true, data: await this.service.crearTarifa(dto) };
  }

  @Post('tarifas/detalles')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Agregar una tasa con vigencia a una tarifa existente', operationId: 'configuradorCrearDetalleTarifa' })
  @ApiBody({ type: CrearDetalleTarifaDto })
  async crearDetalle(@Body() dto: CrearDetalleTarifaDto) {
    return { status: true, data: await this.service.crearDetalleTarifa(dto) };
  }

  @Patch('tarifas/:cramo/:ccober/:ctarifa')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Editar o inactivar tarifa (iestado I)', operationId: 'configuradorEditarTarifa' })
  async editarTarifa(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('ccober') ccober: string,
    @Param('ctarifa') ctarifa: string,
    @Body() dto: EditarTarifaDto,
  ) {
    return { status: true, data: await this.service.editarTarifa(cramo, ccober, ctarifa, dto) };
  }

  // ── Tablas de tasas por edad ───────────────────────────────────────────────

  @Get('tablas-edad/:ctablaedad')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Tabla de tasas por edad con sus tramos y los planes que la usan', operationId: 'configuradorTablaEdad' })
  async tablaEdad(@Param('ctablaedad') ctablaedad: string) {
    return { status: true, data: await this.service.obtenerTablaEdad(ctablaedad) };
  }

  @Post('tablas-edad')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Crear tabla de tasas por edad',
    description: 'Tasa en % (0,449 = 4,49 ‰). Los tramos no pueden solaparse. El código es el ctablatar de los planes de personas.',
    operationId: 'configuradorCrearTablaEdad',
  })
  @ApiBody({ type: CrearTablaEdadDto })
  async crearTablaEdad(@Body() dto: CrearTablaEdadDto) {
    return { status: true, data: await this.service.crearTablaEdad(dto) };
  }

  @Put('tablas-edad/:ctablaedad/tramos')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Reemplazar los tramos de una tabla existente',
    description: 'Corrige tasas o edades. Cambia la tarifa de todos los planes que usan la tabla (se devuelven en `usada_por`).',
    operationId: 'configuradorReemplazarTramos',
  })
  @ApiBody({ type: TramosEdadDto })
  async reemplazarTramos(@Param('ctablaedad') ctablaedad: string, @Body() dto: TramosEdadDto) {
    return { status: true, data: await this.service.reemplazarTramos(ctablaedad, dto.tramos) };
  }

  // ── Planes ─────────────────────────────────────────────────────────────────

  @Post('planes')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Crear plan (spMantPlanes)',
    description:
      'Valida ramo, producto, tarifas vigentes y tablas de tasas antes de llamar a spMantPlanes. En planes de cosas `pprima` ' +
      'por cobertura se graba en maplantar después (spMantPlanes no la recibe).',
    operationId: 'configuradorCrearPlan',
  })
  @ApiBody({ type: PlanDto })
  async crearPlan(@Body() dto: PlanDto) {
    return { status: true, data: await this.service.crearPlan(dto) };
  }

  @Put('planes/:cramo/:cplan')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Actualizar plan (spMantPlanes U)', operationId: 'configuradorEditarPlan' })
  @ApiBody({ type: PlanDto })
  async editarPlan(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: PlanDto) {
    return { status: true, data: await this.service.editarPlan(cramo, cplan, dto) };
  }

  @Delete('planes/:cramo/:cplan')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Eliminar plan (spMantPlanes D)', operationId: 'configuradorEliminarPlan' })
  async eliminarPlan(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.service.eliminarPlan(cramo, cplan) };
  }
}
