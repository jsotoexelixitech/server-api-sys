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
      'Agrega matipoemision, matipopago_entidades y planes por producto para una entidad Sis2000 ' +
      '(centidad+citem: gestor P o canal C). Usado por Exelixi en runtime para mostrar/ocultar pasos ' +
      'sin replicar el mantenimiento de SysIP.',
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

  @Get('actores')
  @ApiOperation({
    summary: 'Catálogo de canales alternos y gestores activos',
    description:
      'Lista macanalalt y magestor con bactivo = 1. Lo consumen los parametrizadores Exelixi ' +
      '(p. ej. módulo OCR, para marcar por canal/gestor si el OCR es obligatorio u opcional).',
    operationId: 'canalActores',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          canales: [{ ccanalalt: 1, xcanalalt: 'CANAL DIGITAL', ctipocanal: 'A' }],
          gestores: [{ cgestor: '215', xgestor: 'GESTOR MARKETPLACE', ccanalalt: 1, cscanalalt: 28 }],
        },
      },
    },
  })
  @ApiCommonErrors()
  async getActores() {
    const data = await this.canalService.getActores();
    return { status: true, data };
  }
}
