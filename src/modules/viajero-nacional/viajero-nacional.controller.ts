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
import { VIAJERO_NACIONAL } from './viajero-nacional.constants';

@ApiTags('Viajero nacional · VIAJE3')
@Controller('v1/viajero-nacional')
export class ViajeroNacionalController {
  constructor(private readonly svc: ViajeroNacionalService) {}

  @Post('plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Plan fijo VIAJE3 (3 días)',
    description:
      'Equivalente a `POST /valrep/planes/por-dias`, pero solo para Viajero Nacional: ' +
      `ramo ${VIAJERO_NACIONAL.cramo}, plan ${VIAJERO_NACIONAL.cplan}, ${VIAJERO_NACIONAL.ndias} días.`,
    operationId: 'viajeroNacionalPlan',
  })
  @ApiBody({ type: GetViaje3PlanDto, required: false })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          cplan: 'VIAJE3',
          xplan: 'Plan Viajero Nacional',
          cramo: 25,
          xramo: 'RIESGOS ESPECIALES',
          cproducto: '1',
          ndias: 3,
          ifrecuencia: 'E',
          fdesde: '2026-09-04',
          fhasta: '2026-09-06',
        },
      },
    },
  })
  @Api500()
  getPlan(@Body() dto: GetViaje3PlanDto) {
    return { status: true, data: this.svc.getPlan(dto ?? {}) };
  }

  @Post('detalle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detalle Sis2000 de VIAJE3',
    description: 'Llama `spBuscaDetallePlan` con cramo=25 y cplan=VIAJE3.',
    operationId: 'viajeroNacionalDetalle',
  })
  @ApiCommonErrors()
  async getDetalle() {
    return { status: true, data: await this.svc.getDetalle() };
  }

  @Post('frecuencia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Frecuencia de VIAJE3 (E + 3 días)',
    description: 'Complemento de por-días: `spBuscaFrecuenciaPlan` del plan fijo.',
    operationId: 'viajeroNacionalFrecuencia',
  })
  @Api500()
  async getFrecuencia() {
    return { status: true, data: { frecuencias: await this.svc.getFrecuencia() } };
  }

  @Post('cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar VIAJE3',
    description: 'Cotiza el plan fijo VIAJE3 con `spCalculoPer`. No usa prorrata viajero.',
    operationId: 'viajeroNacionalCotizacion',
  })
  @ApiBody({ type: CotizacionViaje3Dto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, data: { mprimaext: 2.25, mprima: 1670, ptasa: 742 } } },
  })
  @ApiCommonErrors()
  async cotizar(@Body() dto: CotizacionViaje3Dto) {
    return { status: true, data: await this.svc.cotizar(dto) };
  }

  @Post('validacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar emisión VIAJE3',
    description: 'Fuerza cramo=25 y plan=VIAJE3 antes de `speeValidatePersonGeneral`.',
    operationId: 'viajeroNacionalValidacion',
  })
  @ApiBody({ type: ValidateEmissionPersonDto })
  @ApiCommonErrors()
  async validar(@Body() dto: ValidateEmissionPersonDto) {
    const result = await this.svc.validar(dto as unknown as Record<string, unknown>);
    return { status: result.status, result };
  }

  @Post('emision')
  @HttpCode(HttpStatus.OK)
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_PERSON)
  @ApiOperation({
    summary: 'Emitir póliza VIAJE3',
    description:
      'Misma cadena personas (SP Nexus). El plan/ramo/vigencia de 3 días se fijan en servidor.',
    operationId: 'viajeroNacionalEmision',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: EmitViaje3Dto })
  @Api401()
  @ApiCommonErrors()
  async emitir(@NestApiKey() apikey: string, @Body() dto: EmitViaje3Dto) {
    const result = await this.svc.emitir(apikey ?? '', dto);
    return { status: true, result };
  }
}
