import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { CanalEmisorService, MAX_POLIZAS_EMISOR } from './canal-emisor.service';

@ApiTags('2. Cotización y catálogos')
@Controller('v1/canal')
export class CanalEmisorController {
  constructor(private readonly service: CanalEmisorService) {}

  @Get('polizas-emisor')
  @ApiOperation({
    summary: 'Canal y productor registrados en pólizas emitidas (solo lectura)',
    description:
      'Requiere una apikey registrada (nest_ o maclient_api). Para cada cnpoliza devuelve el ccanalalt y ' +
      'el cproductor de adpoliza (o del primer recibo en adrecibos que los tenga) con sus nombres. ' +
      `Máximo ${MAX_POLIZAS_EMISOR} pólizas separadas por coma. Lo usa el Monitor de expedientes de Nexus.`,
    operationId: 'canalPolizasEmisor',
  })
  @ApiQuery({ name: 'cnpoliza', required: true, example: '2801-123456,2801-123457' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: [
          {
            cnpoliza: '2801-123456',
            ccanalalt: 27,
            xcanalalt: 'CANAL DIGITAL',
            cproductor: 80080,
            xproductor: 'PRODUCTOR',
            cgestor: '749',
          },
        ],
      },
    },
  })
  @ApiCommonErrors()
  async getPolizasEmisor(@Req() req: Request, @Query('cnpoliza') cnpoliza?: string | string[]) {
    const data = await this.service.getEmisorPolizas(req.nestAuth?.apikey, cnpoliza);
    return { status: true, data };
  }
}
