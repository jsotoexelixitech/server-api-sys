import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ConfiguradorCobroDiasService } from './configurador-cobro-dias.service';
import { CobroDiasPlanDto, CotizarCobroDiasDto } from './dto/cobro-dias.dto';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;

/** Cobro por días de un plan (product-builder). Configuración en nest_auth.cfg_plan_cobro_dias; Sis2000 solo se lee. */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador/planes/:cramo/:cplan/cobro-dias')
export class ConfiguradorCobroDiasController {
  constructor(private readonly service: ConfiguradorCobroDiasService) {}

  @Get()
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Cobro por días del plan (prima diaria por cobertura)',
    description: '`data: null` si el plan no tiene cobro por días configurado.',
    operationId: 'configuradorCobroDiasPlan',
  })
  async obtener(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.service.obtener(cramo, cplan) };
  }

  @Put()
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Guardar el cobro por días del plan',
    description:
      'Requiere CONFIGURADOR_COBRO_DIAS_ESCRITURA=1 (si no, 403). Valida en Sis2000 (solo lectura) que el plan exista (404) ' +
      'y que las coberturas sean del plan (400). 1 ≤ dias_min ≤ dias_max ≤ 366.',
    operationId: 'configuradorGuardarCobroDiasPlan',
  })
  @ApiBody({ type: CobroDiasPlanDto })
  async guardar(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('cplan') cplan: string,
    @Body() dto: CobroDiasPlanDto,
    @Req() req: Request,
  ) {
    const por = req.nestAuth?.apiKeyId ?? null;
    return { status: true, data: await this.service.guardar(cramo, cplan, dto, por) };
  }

  @Post('cotizar')
  @HttpCode(HttpStatus.OK)
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Cotizar por días con la prima diaria del plan',
    description: 'días = fhasta - fdesde + 1 (o `dias`). Prima por cobertura redondeada a 2 decimales; prima_total = suma.',
    operationId: 'configuradorCotizarCobroDiasPlan',
  })
  @ApiBody({ type: CotizarCobroDiasDto })
  async cotizar(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string, @Body() dto: CotizarCobroDiasDto) {
    return { status: true, data: await this.service.cotizar(cramo, cplan, dto) };
  }
}
