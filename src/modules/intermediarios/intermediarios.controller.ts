import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { CrearIntermediarioDto } from './dto/crear-intermediario.dto';
import { CrearCanalDto } from './dto/crear-canal.dto';
import { CrearGestorDto } from './dto/crear-gestor.dto';
import { EditarIntermediarioDto } from './dto/editar-intermediario.dto';
import { ConfigurarProductosDto } from './dto/configurar-productos.dto';
import { GuardarComisionDto } from './dto/guardar-comision.dto';
import { IntermediariosService } from './intermediarios.service';
import { IntermediariosComisionesService } from './intermediarios-comisiones.service';
import { IntermediariosProductosService } from './intermediarios-productos.service';

@ApiTags('Intermediarios (Sis2000)')
@Controller('v1/intermediarios')
export class IntermediariosController {
  constructor(
    private readonly intermediarios: IntermediariosService,
    private readonly comisiones: IntermediariosComisionesService,
    private readonly productos: IntermediariosProductosService,
  ) {}

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

  @Get('bancos')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({ summary: 'Bancos nacionales activos (mabanco) para las cuentas del intermediario' })
  async bancos() {
    return { status: true, data: await this.intermediarios.bancos() };
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

  @Get('productos')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Productos para productores con sus planes vigentes',
    description: 'maproductos (iproductor = 1) y planes de maplanes_per / maplanes; porDefecto = plan general de mausuplan.',
  })
  async catalogoProductos() {
    return { status: true, data: await this.productos.catalogo() };
  }

  @Get(':cproductor/productos')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Productos y planes del intermediario',
    description: 'Mismo catálogo con asignado = (plan por defecto o incluido) y no excluido en mausuplan (centidad P).',
  })
  @ApiResponse({ status: 404, description: 'Intermediario inexistente.' })
  async productosIntermediario(@Param('cproductor', ParseIntPipe) cproductor: number) {
    return { status: true, data: await this.productos.catalogo(cproductor) };
  }

  @Put(':cproductor/productos')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Configurar productos y planes del intermediario',
    description:
      'Como products/configureProducts de SysIP: spConfigurePlansProduct por producto y luego spConfigureProducts ' +
      '(mausuplan, centidad P), en una transacción. Los productos que no vienen quedan sin planes.',
  })
  @ApiResponse({ status: 400, description: 'Producto o plan no válido para productores.' })
  @ApiResponse({ status: 404, description: 'Intermediario inexistente.' })
  async configurarProductos(@Param('cproductor', ParseIntPipe) cproductor: number, @Body() dto: ConfigurarProductosDto) {
    const data = await this.productos.configurar(cproductor, dto);
    return { status: true, message: 'Productos configurados.', data };
  }

  @Get('comisiones/ramos')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({ summary: 'Ramos con su comisión general y su máximo (maramos + maarancel general)' })
  async ramosComision() {
    return { status: true, data: await this.comisiones.ramos() };
  }

  @Get('comisiones/planes')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({ summary: 'Planes vigentes de un ramo (maplanes / maplanes_per)' })
  @ApiQuery({ name: 'cramo', required: true })
  async planesComision(@Query('cramo', ParseIntPipe) cramo: number) {
    return { status: true, data: await this.comisiones.planes(cramo) };
  }

  @Get(':cproductor/comisiones')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Comisiones (maarancel), bonos (mabonos) y gastos de ramo (magastosramo) del intermediario',
  })
  @ApiResponse({ status: 404, description: 'Intermediario inexistente.' })
  async listarComisiones(@Param('cproductor', ParseIntPipe) cproductor: number) {
    return { status: true, data: await this.comisiones.listar(cproductor) };
  }

  @Get(':cproductor/comisiones/tope')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Tope del ramo para el intermediario',
    description: 'Comisión máxima + bonos + gastos vigentes en el período frente al máximo del ramo (spComisionTopeProductor).',
  })
  @ApiQuery({ name: 'cramo', required: true })
  @ApiQuery({ name: 'fdesde', required: true, example: '2026-10-19' })
  @ApiQuery({ name: 'fhasta', required: false })
  async topeComision(
    @Param('cproductor', ParseIntPipe) cproductor: number,
    @Query('cramo', ParseIntPipe) cramo: number,
    @Query('fdesde') fdesde: string,
    @Query('fhasta') fhasta?: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(fdesde || '')) throw new BadRequestException('fdesde debe ser AAAA-MM-DD.');
    return { status: true, data: await this.comisiones.tope(cproductor, cramo, fdesde, fhasta || undefined) };
  }

  @Post(':cproductor/comisiones')
  @HttpCode(HttpStatus.OK)
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Crear o actualizar comisión, bono o gasto de ramo del intermediario',
    description:
      'comision -> spActCreComisionProductor (maarancel); bono -> spActCreBonoProductor (mabonos); ' +
      'gasto -> SpActCreGastosRamo (magastosramo). Valida el tope del ramo. iestado N la desactiva.',
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos o supera el máximo del ramo.' })
  async guardarComision(
    @Param('cproductor', ParseIntPipe) cproductor: number,
    @Body() dto: GuardarComisionDto,
    @Headers('x-sis2000-cusuario') operador?: string,
  ) {
    const data = await this.comisiones.guardar(cproductor, dto, Number(operador) || undefined);
    return { status: true, message: 'Guardado.', data };
  }

  // Al final: ':cproductor' no debe tapar las rutas fijas de arriba (bancos, gestores, productos)
  @Get(':cproductor')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Datos editables del intermediario',
    description: 'Correo, usuario web, teléfono, dirección, cuentas de maproduc y cuenta de pago (maclient_banco cmodcob 3).',
  })
  @ApiResponse({ status: 404, description: 'Intermediario inexistente.' })
  async obtener(@Param('cproductor', ParseIntPipe) cproductor: number) {
    return { status: true, data: await this.intermediarios.obtener(cproductor) };
  }

  @Put(':cproductor')
  @NestProtected(NEST_AUTH_SCOPES.INTERMEDIARIOS_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Editar correo, teléfono, dirección y cuentas del intermediario',
    description:
      'En una transacción, en las mismas tablas del alta. Si cambia el correo cambia también el usuario web ' +
      '(la clave no) y se avisa al correo nuevo. La primera cuenta es la cuenta de pago (maclient_banco cmodcob 3).',
  })
  @ApiResponse({ status: 200, description: 'Cambios guardados.' })
  @ApiResponse({ status: 404, description: 'Intermediario inexistente.' })
  @ApiResponse({ status: 409, description: 'El correo ya es de otro usuario o gestor.' })
  async editar(
    @Param('cproductor', ParseIntPipe) cproductor: number,
    @Body() dto: EditarIntermediarioDto,
    @Headers('x-sis2000-cusuario') operador?: string,
  ) {
    const data = await this.intermediarios.editar(cproductor, dto, Number(operador) || undefined);
    return { status: true, message: 'Cambios guardados.', data };
  }
}
