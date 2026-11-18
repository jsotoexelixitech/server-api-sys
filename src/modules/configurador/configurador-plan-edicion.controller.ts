import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { ConfiguradorPlanEdicionService } from './configurador-plan-edicion.service';
import { CabeceraPlanDto, CoberturaPersonasDto, CoberturaPlanDto, TarifaPlanDto } from './dto/configurador-plan-edicion.dto';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;
const BANDERA = 'Requiere CONFIGURADOR_PLANES_ESCRITURA=1 (si no, 403). ';

/** Configurador fase 2: cabecera y coberturas del plan sin pasar por el JSON de spMantPlanes. */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador')
export class ConfiguradorPlanEdicionController {
  constructor(private readonly plan: ConfiguradorPlanEdicionService) {}

  @Patch('planes/:cramo/:cplan')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Editar la cabecera del plan (xplan, cmoneda, cproducto, iestado) en la versión vigente',
    description:
      BANDERA + 'maplanes (patrimonial/auto) o maplanes_per (personas), según dónde esté el plan. cmoneda validada en mamonedas; cproducto en ' +
      "maproductos (avisos si > 6 caracteres u otro ramo). 409 si al poner 'V' quedaría otra versión 'V'. Devuelve { antes, despues, advertencias }.",
    operationId: 'configuradorEditarCabeceraPlan',
  })
  @ApiBody({ type: CabeceraPlanDto })
  async cabecera(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: CabeceraPlanDto) {
    return { status: true, data: await this.plan.editarCabecera(cramo, cplan, dto) };
  }

  @Post('planes/:cramo/:cplan/coberturas')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar una cobertura a un plan de patrimonial o auto (maplancob + maplantar de la versión vigente)',
    description:
      BANDERA + "{ ccobertura, ctarifa, msumamin, msumamax, mprima | pprima, bobligatoria? }. La tarifa debe estar 'V' en matarifa. " +
      "409 si ya está activa; si estaba 'I' se reactiva (accion: 'reactivada'). bobligatoria solo se compara con matarifa (aviso).",
    operationId: 'configuradorAgregarCoberturaPlan',
  })
  @ApiBody({ type: CoberturaPlanDto })
  async agregarCobertura(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: CoberturaPlanDto) {
    return { status: true, data: await this.plan.agregarCobertura(cramo, cplan, dto) };
  }

  @Patch('planes/:cramo/:cplan/coberturas/:ccobertura/tarifas/:ctarifa')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: "Editar suma, prima o tasa de la tarifa del plan (maplantar 'V' de la versión vigente)",
    description: BANDERA + 'La prima y la tasa son excluyentes: al poner una > 0 la otra pasa a 0 (`ajustes`); las dos > 0 → 400. Devuelve { antes, despues, ajustes }.',
    operationId: 'configuradorEditarTarifaPlan',
  })
  @ApiBody({ type: TarifaPlanDto })
  async editarTarifa(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('cplan') cplan: string,
    @Param('ccobertura') ccobertura: string,
    @Param('ctarifa') ctarifa: string,
    @Body() dto: TarifaPlanDto,
  ) {
    return { status: true, data: await this.plan.editarTarifa(cramo, cplan, ccobertura, ctarifa, dto) };
  }

  @Post('planes/:cramo/:cplan/coberturas/:ccobertura/baja')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: "Dar de baja una cobertura de un plan de patrimonial o auto (iestado 'I' en maplancob y maplantar; no borra)",
    description: BANDERA + '409 si es la última cobertura obligatoria (matarifa.bobligatoria T/1). En auto avisa que sp_calculo_auto_nexus no filtra iestado.',
    operationId: 'configuradorBajaCoberturaPlan',
  })
  async bajaCobertura(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Param('ccobertura') ccobertura: string) {
    return { status: true, data: await this.plan.bajaCobertura(cramo, cplan, ccobertura) };
  }

  @Post('planes/:cramo/:cplan/coberturas-personas')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Agregar una cobertura a un plan de personas (maplcober_per + mapltarifas_per de la versión vigente)',
    description:
      BANDERA + "{ ccobertura, ctarifa, bobligatoria? (true), parentescos: [{ cparen, ctablatar, csexo? ('A') }] }. Valida maparent y " +
      "mapltabedad_d. 409 si ya está activa; si estaba 'I' se reactiva. Avisa los parentescos sin fila en mapledades_per.",
    operationId: 'configuradorAgregarCoberturaPersonas',
  })
  @ApiBody({ type: CoberturaPersonasDto })
  async agregarCoberturaPersonas(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: CoberturaPersonasDto) {
    return { status: true, data: await this.plan.agregarCoberturaPersonas(cramo, cplan, dto) };
  }

  @Post('planes/:cramo/:cplan/coberturas-personas/:ccobertura/baja')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: "Dar de baja una cobertura de un plan de personas (iestado 'I' + borrado de sus tarifas por parentesco)",
    description:
      BANDERA + 'mapltarifas_per no tiene iestado y los SP de cálculo/emisión de personas no filtran maplcober_per.iestado: por eso se ' +
      'borran sus tarifas; la respuesta las trae en `tarifasBorradas` (respaldo). 409 si es la última obligatoria.',
    operationId: 'configuradorBajaCoberturaPersonas',
  })
  async bajaCoberturaPersonas(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Param('ccobertura') ccobertura: string) {
    return { status: true, data: await this.plan.bajaCoberturaPersonas(cramo, cplan, ccobertura) };
  }
}
