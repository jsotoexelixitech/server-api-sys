import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { ConfiguradorPatrimonialService } from './configurador-patrimonial.service';
import { ConfiguradorTarifaDiasService } from './configurador-tarifa-dias.service';
import { ConfiguradorTasaCascoService } from './configurador-tasa-casco.service';
import { DispositivoDto, EditarDispositivoDto, EditarSustanciaDto, SustanciaDto } from './dto/configurador-patrimonial.dto';
import { TarifaDiasDto } from './dto/configurador-tarifa-dias.dto';
import {
  CancelarVersionCascoDto, CrearVersionCascoDto, RevisarVersionCascoDto, VistaPreviaCascoDto,
} from './dto/configurador-tasa-casco.dto';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;

/**
 * Configurador, fase 2: descuentos y recargos patrimoniales (madisseg/masustac), condominio (MATARIFA_*_NEXUS, lectura),
 * tarifa por días (maplantar_dias) y tasa de casco por características (SP sp_tarifa_casco_*). Todo requiere
 * `configurador:write`; la escritura además CONFIGURADOR_PATRIMONIAL_ESCRITURA o CONFIGURADOR_AUTO_ESCRITURA.
 */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador')
export class ConfiguradorFase2Controller {
  constructor(
    private readonly patrimonial: ConfiguradorPatrimonialService,
    private readonly dias: ConfiguradorTarifaDiasService,
    private readonly casco: ConfiguradorTasaCascoService,
  ) {}

  // ── Patrimonial: dispositivos de seguridad (madisseg) ──────────────────────

  @Get('ramos/:cramo/dispositivos')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Dispositivos de seguridad del ramo (madisseg, % de descuento)', operationId: 'configuradorDispositivos' })
  async dispositivos(@Param('cramo', ParseIntPipe) cramo: number) {
    return { status: true, data: await this.patrimonial.listar('dispositivos', cramo) };
  }

  @Post('ramos/:cramo/dispositivos')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar un dispositivo de seguridad al ramo (madisseg)',
    description: 'Requiere CONFIGURADOR_PATRIMONIAL_ESCRITURA=1 (si no, 403). pdisseg 0-100. Sin cdisseg: MAX+1 del ramo. 409 si el código existe.',
    operationId: 'configuradorCrearDispositivo',
  })
  @ApiBody({ type: DispositivoDto })
  async crearDispositivo(@Param('cramo', ParseIntPipe) cramo: number, @Body() dto: DispositivoDto) {
    return { status: true, data: await this.patrimonial.crear('dispositivos', cramo, { codigo: dto.cdisseg, descripcion: dto.xdisseg, porcentaje: dto.pdisseg }) };
  }

  @Patch('ramos/:cramo/dispositivos/:cdisseg')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Editar un dispositivo de seguridad (madisseg)',
    description: 'Requiere CONFIGURADOR_PATRIMONIAL_ESCRITURA=1. Sin iestado ni DELETE: para «quitarlo», pdisseg 0. Devuelve antes y despues.',
    operationId: 'configuradorEditarDispositivo',
  })
  @ApiBody({ type: EditarDispositivoDto })
  async editarDispositivo(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('cdisseg', ParseIntPipe) cdisseg: number,
    @Body() dto: EditarDispositivoDto,
  ) {
    return { status: true, data: await this.patrimonial.editar('dispositivos', cramo, cdisseg, { descripcion: dto.xdisseg, porcentaje: dto.pdisseg }) };
  }

  // ── Patrimonial: sustancias peligrosas (masustac) ──────────────────────────

  @Get('ramos/:cramo/sustancias')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Sustancias peligrosas del ramo (masustac, % de recargo)', operationId: 'configuradorSustancias' })
  async sustancias(@Param('cramo', ParseIntPipe) cramo: number) {
    return { status: true, data: await this.patrimonial.listar('sustancias', cramo) };
  }

  @Post('ramos/:cramo/sustancias')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar una sustancia peligrosa al ramo (masustac)',
    description: 'Requiere CONFIGURADOR_PATRIMONIAL_ESCRITURA=1 (si no, 403). porcenta 0-100. Sin csustanc: MAX+1 del ramo. 409 si el código existe.',
    operationId: 'configuradorCrearSustancia',
  })
  @ApiBody({ type: SustanciaDto })
  async crearSustancia(@Param('cramo', ParseIntPipe) cramo: number, @Body() dto: SustanciaDto) {
    return { status: true, data: await this.patrimonial.crear('sustancias', cramo, { codigo: dto.csustanc, descripcion: dto.xsustanc, porcentaje: dto.porcenta }) };
  }

  @Patch('ramos/:cramo/sustancias/:csustanc')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Editar una sustancia peligrosa (masustac)',
    description: 'Requiere CONFIGURADOR_PATRIMONIAL_ESCRITURA=1. Sin iestado ni DELETE: para «quitarla», porcenta 0. Devuelve antes y despues.',
    operationId: 'configuradorEditarSustancia',
  })
  @ApiBody({ type: EditarSustanciaDto })
  async editarSustancia(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('csustanc', ParseIntPipe) csustanc: number,
    @Body() dto: EditarSustanciaDto,
  ) {
    return { status: true, data: await this.patrimonial.editar('sustancias', cramo, csustanc, { descripcion: dto.xsustanc, porcentaje: dto.porcenta }) };
  }

  // ── Patrimonial: condominio (MATARIFA_*_NEXUS) ─────────────────────────────

  @Get('ramos/:cramo/condominio/:tabla')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Tabla de condominio del ramo: antiguedad, reparto o rango (MATARIFA_*_NEXUS)',
    description: 'disponible: false si la tabla no existe en esta base. En reparto, avisos si los % de itipo P no suman 100.',
    operationId: 'configuradorCondominio',
  })
  async condominio(@Param('cramo', ParseIntPipe) cramo: number, @Param('tabla') tabla: string) {
    return { status: true, data: await this.patrimonial.leerCondominio(cramo, tabla) };
  }

  @Put('ramos/:cramo/condominio/:tabla')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Escribir una tabla de condominio (501: la escritura es del tarificador de condominio)',
    description: 'Responde 501: la lógica que escribe MATARIFA_*_NEXUS vive en CondominioService de origin/main y no se duplica aquí.',
    operationId: 'configuradorGuardarCondominio',
  })
  guardarCondominio(@Param('cramo', ParseIntPipe) _cramo: number, @Param('tabla') tabla: string) {
    return this.patrimonial.escribirCondominio(tabla);
  }

  // ── Auto: tarifa por días (maplantar_dias) ─────────────────────────────────

  @Get('planes/:cramo/:cplan/tarifa-dias')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Tarifa por días del plan (maplantar_dias, Binacional), todas las filas', operationId: 'configuradorTarifaDias' })
  async tarifaDias(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.dias.listar(cramo, cplan) };
  }

  @Put('planes/:cramo/:cplan/tarifa-dias/:ccober/:ctarifa')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: "Reemplazar las filas 'V' de una cobertura y tarifa del plan (maplantar_dias)",
    description:
      "Requiere CONFIGURADOR_AUTO_ESCRITURA=1 (si no, 403). Las 'V' anteriores pasan a 'I'. Rangos de días sin solaparse por " +
      '(ctarifabi, bnacional) (0-3 y 3-7 es válido); PK (ctarifabi, qdias, bnacional) sin repetir; plan BINAC*: fila anual ' +
      '(ndias_max 30, la que usa el SP con vigencia de 12 meses) con mprima_anual. La cobertura y tarifa deben estar en maplantar del plan.',
    operationId: 'configuradorReemplazarTarifaDias',
  })
  @ApiBody({ type: TarifaDiasDto })
  async reemplazarTarifaDias(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('cplan') cplan: string,
    @Param('ccober') ccober: string,
    @Param('ctarifa') ctarifa: string,
    @Body() dto: TarifaDiasDto,
  ) {
    return { status: true, data: await this.dias.reemplazar(cramo, cplan, ccober, ctarifa, dto) };
  }

  // ── Auto: tasa de casco por características (sp_tarifa_casco_*) ───────────

  @Get('auto/:cramo/tasa-casco')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Tasa de casco: versión vigente, propuestas en curso y tablas del ramo',
    description:
      '{ cramo, versionado, requiereAprobacion, vigente, enCurso, planes (macalcasco), rangos (marangosum), tasas (marangoano), ' +
      'factores (macobtipo), avisos }. El versionado es global (no lleva cramo).',
    operationId: 'configuradorTasaCasco',
  })
  async tasaCasco(@Param('cramo', ParseIntPipe) cramo: number) {
    return { status: true, data: await this.casco.leer(cramo) };
  }

  @Get('auto/:cramo/tasa-casco/versiones')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Historial de versiones de la tasa de casco (v_tarifa_casco_versiones)', operationId: 'configuradorTasaCascoVersiones' })
  async versionesCasco(@Param('cramo', ParseIntPipe) _cramo: number, @Query('limit') limit?: string) {
    return { status: true, data: await this.casco.versiones(Number(limit) || 50) };
  }

  @Post('auto/:cramo/tasa-casco/vista-previa')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Vista previa de un ajuste (sp_tarifa_casco_vista_previa; no escribe)', operationId: 'configuradorTasaCascoVistaPrevia' })
  @ApiBody({ type: VistaPreviaCascoDto })
  async vistaPreviaCasco(@Param('cramo', ParseIntPipe) cramo: number, @Body() dto: VistaPreviaCascoDto) {
    return { status: true, data: await this.casco.vistaPrevia(cramo, dto) };
  }

  @Post('auto/:cramo/tasa-casco/versiones')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Proponer una versión de la tasa de casco (AJUSTE o RESTAURACION)',
    description:
      'Requiere CONFIGURADOR_AUTO_ESCRITURA=1. AJUSTE → sp_tarifa_casco_ajustar (movimiento, porcentaje, alcance, filtros); ' +
      'RESTAURACION → sp_tarifa_casco_restaurar (version_id). Queda PENDIENTE, o APROBADA/APLICADA si REQUIERE_APROBACION = 0. ' +
      'cusuario necesita permiso PROPONER (TARIFACASCO_ROL). 409 si ya hay una propuesta pendiente o programada.',
    operationId: 'configuradorTasaCascoCrearVersion',
  })
  @ApiBody({ type: CrearVersionCascoDto })
  async crearVersionCasco(@Param('cramo', ParseIntPipe) cramo: number, @Body() dto: CrearVersionCascoDto) {
    return { status: true, data: await this.casco.crearVersion(cramo, dto) };
  }

  @Put('auto/:cramo/tasa-casco/versiones/:id/valores')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Grabar valores por celda en una versión (501: no hay SP)',
    description: 'Responde 501: Sis2000 no tiene un SP para proponer valores por celda; usa AJUSTE o RESTAURACION.',
    operationId: 'configuradorTasaCascoValores',
  })
  grabarValoresCasco(@Param('cramo', ParseIntPipe) _cramo: number, @Param('id', ParseIntPipe) _id: number) {
    return this.casco.grabarValores();
  }

  @Post('auto/:cramo/tasa-casco/versiones/:id/publicar')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Publicar (aprobar) la propuesta pendiente (sp_tarifa_casco_revisar APROBAR)',
    description:
      'Requiere CONFIGURADOR_AUTO_ESCRITURA=1. Si la fecha ya llegó se aplica en el acto; si es futura queda PROGRAMADA. ' +
      'cusuario necesita permiso APROBAR y no puede ser quien la propuso (409).',
    operationId: 'configuradorTasaCascoPublicar',
  })
  @ApiBody({ type: RevisarVersionCascoDto })
  async publicarCasco(@Param('cramo', ParseIntPipe) cramo: number, @Param('id', ParseIntPipe) id: number, @Body() dto: RevisarVersionCascoDto) {
    return { status: true, data: await this.casco.publicar(cramo, id, dto) };
  }

  @Post('auto/:cramo/tasa-casco/versiones/:id/rechazar')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Rechazar la propuesta pendiente (sp_tarifa_casco_revisar RECHAZAR; comentario ≥ 5)', operationId: 'configuradorTasaCascoRechazar' })
  @ApiBody({ type: RevisarVersionCascoDto })
  async rechazarCasco(@Param('cramo', ParseIntPipe) cramo: number, @Param('id', ParseIntPipe) id: number, @Body() dto: RevisarVersionCascoDto) {
    return { status: true, data: await this.casco.rechazar(cramo, id, dto) };
  }

  @Post('auto/:cramo/tasa-casco/versiones/:id/cancelar')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Cancelar una versión aprobada aún no aplicada (sp_tarifa_casco_cancelar)', operationId: 'configuradorTasaCascoCancelar' })
  @ApiBody({ type: CancelarVersionCascoDto })
  async cancelarCasco(@Param('cramo', ParseIntPipe) cramo: number, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelarVersionCascoDto) {
    return { status: true, data: await this.casco.cancelar(cramo, id, dto) };
  }
}
