import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfiguradorService } from './configurador.service';
import {
  BajaProveedorPlanDto, CanalesPlanDto, CanalesQueryDto, CrearCoberturaDto, CrearDetalleTarifaDto, CrearProductoDto, CrearTablaEdadDto,
  CrearTarifaDto,
  EditarCoberturaDto, EditarProveedorPlanDto, EditarTarifaDto, PlanDto, ProductoresQueryDto, ProveedoresQueryDto,
  ProveedorPlanDto, RamoQueryDto, TarifasQueryDto, TramosEdadDto,
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

  // ── Ramos y productos ──────────────────────────────────────────────────────

  @Get('ramos')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Ramos de Sis2000 (maramos) para elegir el ramo de un producto o plan', operationId: 'configuradorRamos' })
  async ramos() {
    return { status: true, data: await this.service.listarRamos() };
  }

  @Post('productos')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Crear producto (sp_CrearProducto)',
    description:
      'Requiere CONFIGURADOR_PRODUCTOS_ESCRITURA=1 (si no, 403). Valida que el ramo exista y llama a sp_CrearProducto; ' +
      'si el SP responde status 0 (p. ej. código ya registrado) devuelve 400 con su mensaje. Solo alta: no hay edición.',
    operationId: 'configuradorCrearProducto',
  })
  @ApiBody({ type: CrearProductoDto })
  async crearProducto(@Body() dto: CrearProductoDto) {
    return { status: true, data: await this.service.crearProducto(dto) };
  }

  // ── Productores ────────────────────────────────────────────────────────────

  @Get('productores')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Productores (maproduc) para asignar a un plan; filtro por nombre o código', operationId: 'configuradorProductores' })
  async productores(@Query() q: ProductoresQueryDto) {
    return { status: true, data: await this.service.listarProductores(q.q ?? '') };
  }

  // ── Canales alternos ───────────────────────────────────────────────────────

  @Get('canales')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Canales alternos activos (macanalalt) para asignar a un plan; filtro por nombre o código',
    description: 'En mausuplan el canal va con centidad C y citem = ccanalalt. Solo lectura.',
    operationId: 'configuradorCanales',
  })
  async canales(@Query() q: CanalesQueryDto) {
    return { status: true, data: await this.service.listarCanales(q.q ?? '') };
  }

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

  @Get('planes/:cramo/:cplan')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Leer un plan completo (respaldo antes de modificar)',
    description:
      'Filas de maplanes/maplanes_per, maplantar, maplcober_per, mapltarifas_per, mapledades_per, maplanes_frec y mausuplan, ' +
      'más el plan en la forma de PlanDto y advertencias de lo que no se puede reponer. `data: null` si el plan no existe.',
    operationId: 'configuradorLeerPlan',
  })
  async leerPlan(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.service.obtenerPlan(cramo, cplan) };
  }

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

  @Post('planes/:cramo/:cplan/canales')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar canales alternos al plan (mausuplan centidad C)',
    description:
      'Solo alta: inserta los canales que el plan no tiene; los que ya están no se tocan y nunca se borra ninguno. ' +
      'No pasa por spMantPlanes. all_canal = fila con citem NULL (todos los canales).',
    operationId: 'configuradorAgregarCanalesPlan',
  })
  @ApiBody({ type: CanalesPlanDto })
  async agregarCanalesPlan(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: CanalesPlanDto) {
    return { status: true, data: await this.service.agregarCanalesPlan(cramo, cplan, dto) };
  }

  // ── Proveedores del plan (maplprov_per) ────────────────────────────────────

  @Get('proveedores')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Catálogo de proveedores (maclient_prov ⋈ maclient) con sus claves; filtro por nombre o RIF',
    operationId: 'configuradorProveedores',
  })
  async proveedores(@Query() q: ProveedoresQueryDto) {
    return { status: true, data: await this.service.listarProveedores(q.q ?? '') };
  }

  @Get('planes/:cramo/:cplan/proveedores')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Proveedores del plan (todas las vigencias) y si la escritura está habilitada',
    description: 'El proveedor se asigna al plan y aplica a todas sus coberturas. Al emitir personas se copia a adproveedor.',
    operationId: 'configuradorProveedoresPlan',
  })
  async proveedoresPlan(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.service.listarProveedoresPlan(cramo, cplan) };
  }

  @Post('planes/:cramo/:cplan/proveedores')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar proveedor al plan (maplprov_per)',
    description: 'Requiere CONFIGURADOR_PROVEEDORES_ESCRITURA=1. Valida plan, proveedor y que la vigencia no se solape.',
    operationId: 'configuradorAgregarProveedorPlan',
  })
  @ApiBody({ type: ProveedorPlanDto })
  async agregarProveedorPlan(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: ProveedorPlanDto) {
    return { status: true, data: await this.service.agregarProveedorPlan(cramo, cplan, dto) };
  }

  @Patch('planes/:cramo/:cplan/proveedores')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Editar proveedor del plan (vigencia hasta, tipo de servicio, costo, moneda)', operationId: 'configuradorEditarProveedorPlan' })
  @ApiBody({ type: EditarProveedorPlanDto })
  async editarProveedorPlan(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: EditarProveedorPlanDto) {
    return { status: true, data: await this.service.editarProveedorPlan(cramo, cplan, dto) };
  }

  @Post('planes/:cramo/:cplan/proveedores/baja')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Dar de baja un proveedor del plan (cierra la vigencia; no borra)', operationId: 'configuradorBajaProveedorPlan' })
  @ApiBody({ type: BajaProveedorPlanDto })
  async bajaProveedorPlan(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: BajaProveedorPlanDto) {
    return { status: true, data: await this.service.bajaProveedorPlan(cramo, cplan, dto) };
  }
}
