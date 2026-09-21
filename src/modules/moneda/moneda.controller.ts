import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { MonedaService } from './moneda.service';
import { GetTasaBcvDto } from './dto/get-tasa-bcv.dto';

@ApiTags('2. Cotización y catálogos')
@Controller('v1/moneda')
export class MonedaController {
  constructor(private readonly monedaService: MonedaService) {}

  @Get('tasa-bcv')
  @ApiOperation({
    summary: 'Tasa BCV USD por fecha de pago',
    description:
      'Consulta Sis2000 (mavamonedas / mavamoneda) para alinear montos en Bs con la fecha del pago móvil. ' +
      'Paridad spNotificaPago: CONVERT(date, fmoneda) = fecha del pago.',
    operationId: 'monedaTasaBcv',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: { ptasa: 848.5458, fecha: '2026-09-18', source: 'mavamonedas' },
      },
    },
  })
  @ApiCommonErrors()
  async getTasaBcv(@Query() query: GetTasaBcvDto) {
    const fecha = query.fecha ?? query.fmoneda;
    const data = await this.monedaService.getTasaBcvUsdForDate(fecha);
    return { status: true, data };
  }
}
