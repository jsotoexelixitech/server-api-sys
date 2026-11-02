import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { ApiCrudErrors } from '../../common/swagger/api-error-responses';
import { RenovacionService } from './renovacion.service';

@ApiTags('Renovación (póliza nueva)')
@Controller('v1/renovacion')
@NestProtected(NEST_AUTH_SCOPES.RENOVACION_READ)
export class RenovacionController {
  constructor(private readonly renovacion: RenovacionService) {}

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
