import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RiesgosGeneralesService } from './riesgos-generales.service';
import { CotizarCoberturasDto, EmitirCoberturasDto, TarifaPlanDto } from './dto/riesgos-generales.dto';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiTags('2. Cotización y catálogos')
@Controller('v1/riesgos-generales')
export class RiesgosGeneralesController {
  constructor(private readonly service: RiesgosGeneralesService) {}

  @Get('tarifa')
  @ApiOperation({
    summary: 'Tarifa por cobertura de un plan (ramos 16 y 38)',
    description:
      'Coberturas del plan (maplantar) con la tasa y los topes vigentes de matarifa_d, si son obligatorias (matarifa.bobligatoria ' +
      'o cobertura básica) y la comisión. `msumaplan` es la suma del plan, usada como valor por defecto.',
    operationId: 'riesgosGeneralesTarifa',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiCommonErrors()
  async tarifa(@Query() dto: TarifaPlanDto) {
    return { status: true, data: await this.service.getTarifa(dto) };
  }

  @Post('cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar coberturas elegidas',
    description: 'Prima de cada cobertura = suma × tasa de matarifa_d / 100. Valida obligatorias, topes y tasas vigentes.',
    operationId: 'riesgosGeneralesCotizacion',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: CotizarCoberturasDto, examples: { hogar: { value: { cramo: 38, cplan: '2', coberturas: [{ ccober: '1', suma: 140000 }, { ccober: '5', suma: 24000 }] } } } })
  @ApiCommonErrors()
  async cotizar(@Body() dto: CotizarCoberturasDto) {
    return { status: true, data: await this.service.cotizar(dto) };
  }

  @Post('emision')
  @HttpCode(HttpStatus.OK)
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_RIESGOS_GENERALES)
  @ApiOperation({
    summary: 'Emitir con las coberturas elegidas',
    description:
      'Recalcula la cotización en el servidor (no acepta primas del cliente) y emite cobertura por cobertura con ' +
      'sp_pre_emision_condominio_nexus. Recibo pendiente de cobro. Requiere el scope `emissions:riesgos-generales`.',
    operationId: 'riesgosGeneralesEmision',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: EmitirCoberturasDto })
  @ApiCommonErrors()
  async emitir(@Body() dto: EmitirCoberturasDto) {
    return { status: true, data: await this.service.emitir(dto) };
  }
}
