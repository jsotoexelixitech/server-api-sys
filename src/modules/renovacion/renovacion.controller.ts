import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { ApiCrudErrors } from '../../common/swagger/api-error-responses';
import { RenovacionService } from './renovacion.service';
import { RenovacionLinkService } from './renovacion-link.service';

@ApiTags('Renovación (póliza nueva)')
@Controller('v1/renovacion')
@NestProtected(NEST_AUTH_SCOPES.RENOVACION_READ)
export class RenovacionController {
  constructor(
    private readonly renovacion: RenovacionService,
    private readonly links: RenovacionLinkService,
  ) {}

  @Post(':cnpoliza/link')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Link "Renovar" listo para abrir (OCR con nexus_token + renovar)',
    description:
      'Valida elegibilidad (`RENOVACION_PERMITIR_FUERA_VENTANA=true` deja pasar ANTES_DE_VENTANA/FUERA_DE_VENTANA; ' +
      'ANULADA/YA_RENOVADA → 422), arma la metadata del canal de la póliza (canal alterno/productor, gestor, ramo, producto) ' +
      'y pide el nexus_token a Nexus `sso-delegate` con `NEXUS_RENOVACION_API_KEY`. ' +
      'Devuelve `{ link, expira_en, cnpoliza }`; el token dura 1 h. Falta de configuración → 503 con la variable.',
  })
  @ApiParam({ name: 'cnpoliza', example: '18-1-1000033143' })
  @ApiQuery({ name: 'centidad', required: false })
  @ApiQuery({ name: 'citem', required: false })
  @ApiResponse({ status: 200, description: '{ link, expira_en, cnpoliza, metadata_canal }' })
  @ApiResponse({ status: 422, description: 'Póliza no elegible (motivo/mensaje)' })
  @ApiResponse({ status: 503, description: 'Falta NEXUS_API_URL / NEXUS_RENOVACION_API_KEY / RENOVACION_NEXUS_EMPRESA_ID / RENOVACION_SUBMODULO_OCR_RCV|PERSONAS' })
  @ApiCrudErrors()
  async link(
    @Param('cnpoliza') cnpoliza: string,
    @Query('centidad') centidad?: string,
    @Query('citem') citem?: string,
  ) {
    const data = await this.links.generar(cnpoliza, { centidad, citem });
    return { status: true, data };
  }

  @Get(':cnpoliza')
  @ApiOperation({
    summary: 'Datos para renovar una póliza (solo lectura)',
    description:
      'Para el cliente es una renovación; en Sis2000 se emite una **póliza nueva** enlazada con `cnpoliza_rel`.\n\n' +
      'Devuelve la póliza origen, tomador/titular/asegurados o vehículo para precargar el formulario, ' +
      '`elegible` + `motivo` (ventana `RENOVACION_DIAS_ANTES`/`RENOVACION_DIAS_DESPUES`, default 30/30), ' +
      '`plan_actual`, `otros_planes` (planes de hoy para el ramo/producto/canal) y `fdesde_sugerida`. No emite ni escribe nada.',
  })
  @ApiParam({ name: 'cnpoliza', example: '18-1-0000137487' })
  @ApiQuery({ name: 'centidad', required: false, description: 'Canal para planes (P/C). Default: canal alterno de la póliza o su productor.' })
  @ApiQuery({ name: 'citem', required: false, description: 'Código del canal/productor para planes.' })
  @ApiQuery({ name: 'ctipo', required: false, description: 'RCV: tipo de vehículo para planes. Default: VInma.ctipo del vehículo de la póliza.' })
  @ApiQuery({ name: 'iplaca', required: false, description: 'RCV: N nacional / E extranjera / B binacional. Default: N (B si el plan es BINAC*).' })
  @ApiResponse({ status: 200, description: 'Datos de renovación' })
  @ApiCrudErrors()
  async consultar(
    @Param('cnpoliza') cnpoliza: string,
    @Query('centidad') centidad?: string,
    @Query('citem') citem?: string,
    @Query('ctipo') ctipo?: string,
    @Query('iplaca') iplaca?: string,
  ) {
    const data = await this.renovacion.consultar(cnpoliza, { centidad, citem, ctipo, iplaca });
    return { status: true, data };
  }
}
