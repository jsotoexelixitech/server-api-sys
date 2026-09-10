import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EndososService } from './endosos.service';
import { CrearReciboEndosoDto } from './dto/crear-recibo.dto';
import { ApiCrudErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';

/**
 * Ruta legacy usada por el motor de endosos:
 * POST /api/v1/endoso-recibos/crearRecibo
 */
@ApiTags(SWAGGER_TAGS.ENDOSOS)
@Controller('endoso-recibos')
export class EndosoRecibosController {
  constructor(private readonly endososService: EndososService) {}

  @Post('crearRecibo')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear recibo de endoso (alias legacy)',
    description:
      'Alias de POST /endosos/recibos. Acepta ifrecuencia/ncuotas para actualizar la frecuencia de pago en la póliza.',
  })
  @ApiBody({ type: CrearReciboEndosoDto })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        status: true,
        message: 'Recibo de endoso creado exitosamente.',
        cnrecibo: '18-10002',
        crecibo: 180000002,
        ifrecuencia: 'S',
      },
    },
  })
  @ApiCrudErrors()
  async crearRecibo(@Body() dto: CrearReciboEndosoDto) {
    return await this.endososService.crearRecibo(dto);
  }
}
