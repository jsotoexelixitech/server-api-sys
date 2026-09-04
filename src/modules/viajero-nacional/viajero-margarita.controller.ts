import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Api401, Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NestApiKey } from '../auth/decorators/nest-api-key.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { ValidateEmissionPersonDto } from '../emissions/dto/validate-emission-person.dto';
import { EmitViaje3Dto } from './dto/emit-viaje3.dto';
import { ViajeroNacionalService } from './viajero-nacional.service';
import { GetViaje3PlanDto } from './dto/get-viaje3-plan.dto';
import { CotizacionViaje3Dto } from './dto/cotizacion-viaje3.dto';
import { VIAJERO_MARGARITA } from './viajero-nacional.constants';

@ApiTags('Viajero Margarita · VIAJE4')
@Controller('v1/viajero-margarita')
export class ViajeroMargaritaController {
  constructor(private readonly svc: ViajeroNacionalService) {}

  @Post('plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Plan fijo VIAJE4 (Viajero Margarita)',
    description:
      `Ramo ${VIAJERO_MARGARITA.cramo}, plan ${VIAJERO_MARGARITA.cplan}. ` +
      'Misma API que viajero-nacional; no usa prorrata ni el VIAJE4 del ramo 5.',
    operationId: 'viajeroMargaritaPlan',
  })
  @ApiBody({ type: GetViaje3PlanDto, required: false })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          cplan: 'VIAJE4',
          xplan: 'Plan Viajero Margarita',
          cramo: 25,
          xramo: 'RIESGOS ESPECIALES',
          cproducto: '1',
          ndias: 4,
          ifrecuencia: 'E',
        },
      },
    },
  })
  @Api500()
  getPlan(@Body() dto: GetViaje3PlanDto) {
    return { status: true, data: this.svc.getPlan(dto ?? {}, VIAJERO_MARGARITA) };
  }

  @Post('detalle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detalle Sis2000 de VIAJE4 Margarita',
    description: 'Llama `spBuscaDetallePlan` con cramo=25 y cplan=VIAJE4.',
    operationId: 'viajeroMargaritaDetalle',
  })
  @ApiCommonErrors()
  async getDetalle() {
    return { status: true, data: await this.svc.getDetalle(VIAJERO_MARGARITA) };
  }

  @Post('frecuencia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Frecuencia de VIAJE4 Margarita',
    description: '`spBuscaFrecuenciaPlan` del plan fijo.',
    operationId: 'viajeroMargaritaFrecuencia',
  })
  @Api500()
  async getFrecuencia() {
    return { status: true, data: { frecuencias: await this.svc.getFrecuencia(VIAJERO_MARGARITA) } };
  }

  @Post('cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar VIAJE4 Margarita',
    description: 'Cotiza con `spCalculoPer`. No usa prorrata viajero.',
    operationId: 'viajeroMargaritaCotizacion',
  })
  @ApiBody({ type: CotizacionViaje3Dto })
  @ApiCommonErrors()
  async cotizar(@Body() dto: CotizacionViaje3Dto) {
    return { status: true, data: await this.svc.cotizar(dto, VIAJERO_MARGARITA) };
  }

  @Post('validacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar emisión VIAJE4 Margarita',
    description: 'Fuerza cramo=25 y plan=VIAJE4 antes de `speeValidatePersonGeneral`.',
    operationId: 'viajeroMargaritaValidacion',
  })
  @ApiBody({ type: ValidateEmissionPersonDto })
  @ApiCommonErrors()
  async validar(@Body() dto: ValidateEmissionPersonDto) {
    const result = await this.svc.validar(dto as unknown as Record<string, unknown>, VIAJERO_MARGARITA);
    return { status: result.status, result };
  }

  @Post('emision')
  @HttpCode(HttpStatus.OK)
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_PERSON)
  @ApiOperation({
    summary: 'Emitir póliza VIAJE4 Margarita',
    description: 'Misma cadena personas (SP Nexus). Plan/ramo se fijan en servidor.',
    operationId: 'viajeroMargaritaEmision',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: EmitViaje3Dto })
  @Api401()
  @ApiCommonErrors()
  async emitir(@NestApiKey() apikey: string, @Body() dto: EmitViaje3Dto) {
    const result = await this.svc.emitir(apikey ?? '', dto, VIAJERO_MARGARITA);
    return { status: true, result };
  }
}
