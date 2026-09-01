import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { CanalService } from './canal.service';
import { GetCanalVisibilityDto } from './dto/get-canal-visibility.dto';

@ApiTags('2. Cotización y catálogos')
@Controller('v1/canal')
export class CanalController {
  constructor(private readonly canalService: CanalService) {}

  @Get('visibility')
  @ApiOperation({
    summary: 'Visibilidad de canal (planes, emisión y métodos de pago)',
    description:
      'Agrega matipoemision, matipopago_entidades y planes por producto para un canal alterno. ' +
      'Usado por Exelixi en runtime para mostrar/ocultar pasos sin replicar el mantenimiento de SysIP.',
    operationId: 'canalVisibility',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          ccanalalt: 1,
          tipoEmision: 'emit_pay',
          tipoPago: ['sypago', 'meritop'],
          planes: [{ cplan: '01', cramo: 18, xplan: 'PLAN BÁSICO' }],
          ui: {
            mostrarPasoPago: true,
            requierePagoVerificado: true,
            metodosPago: ['otp', 'domiciliacion', 'mobile'],
            planesPermitidos: ['01'],
          },
        },
      },
    },
  })
  @ApiCommonErrors()
  async getVisibility(@Query() query: GetCanalVisibilityDto) {
    const data = await this.canalService.getVisibility(query);
    return { status: true, data };
  }
}
