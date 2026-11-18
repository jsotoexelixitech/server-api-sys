import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { ConfiguradorAutoService } from './configurador-auto.service';
import { ConfiguradorComisionesService } from './configurador-comisiones.service';
import { ConfiguradorRevisionService } from './configurador-revision.service';
import { TasasAntiguedadDto, TipoUsoDto } from './dto/configurador-auto.dto';
import { BajaComisionPlanDto, ComisionPlanDto } from './dto/configurador-comisiones.dto';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;

/**
 * Configurador, fase 1 (auto primero): comisiones (maarancel), tipo y uso (macattip), tasas por antigüedad
 * (maplantar_ano) y revisión del plan. Todo requiere `configurador:write`; cada escritura además su bandera de entorno.
 */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador')
export class ConfiguradorPlanFase1Controller {
  constructor(
    private readonly comisiones: ConfiguradorComisionesService,
    private readonly auto: ConfiguradorAutoService,
    private readonly revision: ConfiguradorRevisionService,
  ) {}

  // ── Comisiones (maarancel) ─────────────────────────────────────────────────

  @Get('planes/:cramo/:cplan/comisiones')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: "Comisiones del plan (maarancel), incluidas las del ramo (cplan '0') con aplicaA",
    description: "Comodines: cproductor 0 = todos, ccober '0' = todas, ctarifa '0' = todas. Todas las vigencias y estados (V, I, N).",
    operationId: 'configuradorComisionesPlan',
  })
  async listarComisiones(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.comisiones.listar(cramo, cplan) };
  }

  @Post('planes/:cramo/:cplan/comisiones')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar una comisión al plan (maarancel)',
    description:
      "Requiere CONFIGURADOR_COMISIONES_ESCRITURA=1 (si no, 403). pcomision 0-100. 409 si ya hay una fila 'V' con la misma llave " +
      "(sin fdesde) o una fila con la misma llave y fecha. `advertencias` si el ramo queda con más de una fila 'V' por cobertura o tarifa.",
    operationId: 'configuradorCrearComisionPlan',
  })
  @ApiBody({ type: ComisionPlanDto })
  async crearComision(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: ComisionPlanDto) {
    return { status: true, data: await this.comisiones.crear(cramo, cplan, dto) };
  }

  @Post('planes/:cramo/:cplan/comisiones/baja')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: "Dar de baja una comisión del plan (fhasta + iestado 'I'; no borra)",
    description: "Requiere CONFIGURADOR_COMISIONES_ESCRITURA=1. Solo filas 'V' del plan (no las del ramo ni las 'N'). 404 si no existe, 409 si no está 'V'.",
    operationId: 'configuradorBajaComisionPlan',
  })
  @ApiBody({ type: BajaComisionPlanDto })
  async bajaComision(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: BajaComisionPlanDto) {
    return { status: true, data: await this.comisiones.baja(cramo, cplan, dto) };
  }

  // ── Auto: tipo y uso (macattip, por ramo) ──────────────────────────────────

  @Get('auto/:cramo/tipos')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Tipos de vehículo del ramo (matipos)', operationId: 'configuradorAutoTipos' })
  async tipos(@Param('cramo', ParseIntPipe) cramo: number) {
    return { status: true, data: await this.auto.listarTipos(cramo) };
  }

  @Get('auto/:cramo/usos')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Usos (categorías) del ramo (macategtr)', operationId: 'configuradorAutoUsos' })
  async usos(@Param('cramo', ParseIntPipe) cramo: number) {
    return { status: true, data: await this.auto.listarUsos(cramo) };
  }

  @Get('auto/:cramo/tipos-uso')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Tipo y uso del ramo (macattip) y planes afectados',
    description: 'Afecta a todos los planes del ramo: `planesAfectados` = planes V del ramo; `otrosRamos` por fila = ramos con el mismo par.',
    operationId: 'configuradorAutoTiposUso',
  })
  async tiposUso(@Param('cramo', ParseIntPipe) cramo: number) {
    return { status: true, data: await this.auto.listarTiposUso(cramo) };
  }

  @Put('auto/:cramo/tipos-uso/:ctipo/:ccategotr')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Crear o editar un par tipo/uso del ramo (macattip)',
    description:
      'Requiere CONFIGURADOR_AUTO_ESCRITURA=1 (si no, 403). Solo escribe los campos enviados. Valida ctipo (matipos), ccategotr ' +
      '(macategtr), porcentajes 0-100 y montos ≥ 0. Si el par existe en otro ramo responde grabado: false con advertencias; ' +
      'con confirmar: true graba. Sin baja en esta fase.',
    operationId: 'configuradorAutoGuardarTipoUso',
  })
  @ApiBody({ type: TipoUsoDto })
  async guardarTipoUso(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('ctipo', ParseIntPipe) ctipo: number,
    @Param('ccategotr', ParseIntPipe) ccategotr: number,
    @Body() dto: TipoUsoDto,
  ) {
    return { status: true, data: await this.auto.guardarTipoUso(cramo, ctipo, ccategotr, dto) };
  }

  // ── Auto: tasas por antigüedad (maplantar_ano, por plan) ───────────────────

  @Get('planes/:cramo/:cplan/tasas-antiguedad')
  @NestProtected(SCOPE)
  @ApiOperation({ summary: 'Tasas de casco por antigüedad del vehículo (maplantar_ano), todas las filas', operationId: 'configuradorTasasAntiguedad' })
  async tasas(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.auto.listarTasas(cramo, cplan) };
  }

  @Put('planes/:cramo/:cplan/tasas-antiguedad/:ccober/:ctarifa')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: "Reemplazar los tramos 'V' de una cobertura y tarifa del plan (maplantar_ano)",
    description:
      'Requiere CONFIGURADOR_AUTO_ESCRITURA=1 (si no, 403). Tramos desde 0, sin huecos ni solapes, pprima > 0; la cobertura y tarifa ' +
      "deben estar en maplantar del plan. Los 'V' anteriores pasan a 'I'. Si la cobertura no es casco (1/2/28 del ramo 18) responde " +
      'grabado: false con advertencias; con confirmar: true graba. tramos: [] inactiva todos.',
    operationId: 'configuradorReemplazarTasasAntiguedad',
  })
  @ApiBody({ type: TasasAntiguedadDto })
  async reemplazarTasas(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('cplan') cplan: string,
    @Param('ccober') ccober: string,
    @Param('ctarifa') ctarifa: string,
    @Body() dto: TasasAntiguedadDto,
  ) {
    return { status: true, data: await this.auto.reemplazarTasas(cramo, cplan, ccober, ctarifa, dto) };
  }

  // ── Revisión del plan ──────────────────────────────────────────────────────

  @Get('planes/:cramo/:cplan/revision')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: '¿Se puede emitir? Revisión del plan (solo lectura)',
    description:
      "{ familia, listo, items: [{ codigo, nivel: error|aviso|ok, mensaje, seccion }] }. listo = sin errores. seccion 'plan' = ficha del plan.",
    operationId: 'configuradorRevisionPlan',
  })
  async revisar(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.revision.revisar(cramo, cplan) };
  }
}
