import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChangesService } from './changes.service';
import { ChangeClientDto } from './dto/change-client.dto';
import { ApiCrudErrors } from '../../common/swagger/api-error-responses';

@ApiExcludeController()
@ApiTags('changes')
@Controller('v1/changes')
export class ChangesController {
  constructor(private readonly changesService: ChangesService) {}

  // ── POST /api/v1/changes/client ──────────────────────────────────────────

  @Post('client')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar datos del cliente',
    description:
      'Actualiza `maclient` con los campos enviados y propaga cambios en cascada a ' +
      '`maclient_tel`, `maclient_dir`, `maclient_correo`, `adpoliza`, `adrecibos` y `vhcerti`. ' +
      'Solo se actualizan los campos presentes en el body. ' +
      'Si `cci_rif` cambia, el RIF antiguo se reemplaza en todas las tablas relacionadas.',
  })
  @ApiBody({ type: ChangeClientDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: { message: 'Cambios al cliente realizados con éxito', body: { old_cci_rif: '12345678', xnombre: 'GABRIEL' } },
      },
    },
  })
  @ApiCrudErrors()
  async changeClientData(@Body() body: ChangeClientDto) {
    const data = await this.changesService.changeClientData(body);
    return { status: true, data };
  }
}
