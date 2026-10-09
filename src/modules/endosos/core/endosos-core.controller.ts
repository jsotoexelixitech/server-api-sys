import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { EndososCoreService, CoreResult } from './endosos-core.service';
import { SWAGGER_TAGS } from '../../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../../auth/scopes/nest-auth-scopes.constants';

/**
 * Rutas que consume el backend del Motor de Endosos (git-web-endosos-backend), centralizadas
 * aquí desde SysIP-backend. Mismo contrato de petición/respuesta que el legado; en Parametrización
 * del tenant se apunta cada endpoint a `/api/endosos/core/<ruta>`.
 */
@ApiTags(SWAGGER_TAGS.ENDOSOS)
@Controller('endosos/core')
@NestProtected(NEST_AUTH_SCOPES.ENDOSOS_WRITE)
export class EndososCoreController {
  constructor(private readonly core: EndososCoreService) {}

  private send(res: Response, result: CoreResult) {
    res.status(result.httpStatus);
    return result.body;
  }

  @Post('policies-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cartera con datos de contacto (searchPolicies)',
    description:
      'Pólizas con teléfono/correo del asegurado, paginadas (`page`, `steps`) y filtradas por `ccorredor`, ' +
      '`cramo`, `cplan`, `casegurado`, `cnpoliza`. `includeReceipts` / `includeCoverages` añaden recibos y coberturas.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async policiesInfo(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.policiesInfo(body ?? {}));
  }

  @Post('poliza')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar póliza con recibos (getPolicyById)',
    description: 'Por `cnpoliza`, `cgestor`, `ccorredor` o `casegurado` (y `cramo`). Devuelve `data.list` indexado por póliza.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async poliza(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.searchPoliza(body ?? {}));
  }

  @Post('poliza-only')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar póliza sin recibos (getPolicyById, alternativa liviana)',
    description: 'Filtros de igualdad sobre adpoliza (`cnpoliza`, `cramo`, `cplan`...) con `page` y `steps`.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async polizaOnly(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.searchPolizaOnly(body ?? {}));
  }

  @Post('poliza-recibos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detalle de póliza: recibos, vehículo y coberturas reales (getPolicyDetails)',
    description: 'Requiere `cnpoliza`, `cramo`, `fanopol`, `fmespol`. Devuelve `recibosInfo`.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async polizaRecibos(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.searchRecibosFromPoliza(body ?? {}));
  }

  @Post('plan-coberturas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Coberturas de un plan (planCoverages)',
    description: 'Requiere `cplan` y opcionalmente `cramo` (default 18).',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async planCoberturas(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.getPlanCoverages(body ?? {}));
  }

  @Post('calcular-plan-sis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prima del plan calculada como Sis2000 (calculatePlan)',
    description: 'Ejecuta `spCalculoAuto`. Devuelve `mount` (detalle), `pa`, `ca`, `pt`, `pp`, `ap` y banderas de casco.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async calcularPlanSis(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.calculatePlanSis(body ?? {}));
  }

  @Post('planes-solicitud')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Planes con cobertura y tasas para una solicitud (planesSolicitud)',
    description: 'Ejecuta `spCalculoAuto` y agrupa por plan: `planes[]` con tasas TCA/TPT/TPP y coberturas.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async planesSolicitud(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.calculatePlanSolicitud(body ?? {}));
  }

  @Post('anular-recibos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular recibos pendientes por número (voidReceipts)',
    description:
      'Body: `cnpoliza`, `recibos` (lista de cnrecibo), `fanulacion`, `cusuario`. ' +
      'Atómico: anula el recibo, su cobertura y el recibo del contrato (flota), con bitácora en `auoperaciones`.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  async anularRecibos(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.anularRecibos(body ?? {}));
  }
}
