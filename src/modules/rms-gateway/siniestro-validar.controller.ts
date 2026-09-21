import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { ApiCrudErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { RmsSiniestroValidarDto } from './dto/rms-sync.dto';
import { RmsGatewayService } from './rms-gateway.service';

/**
 * RMS → La Mundial: el gateway llama `POST /siniestros/validar` antes de emitir.
 * Sin envelope para que MundialSiniestroApiClient lea `status` / `cerror` en la raíz.
 */
@ApiTags(SWAGGER_TAGS.ENDOSOS)
@Controller('v1/siniestros')
@NestProtected(NEST_AUTH_SCOPES.ENDOSOS_WRITE)
export class SiniestroValidarController {
  constructor(private readonly rms: RmsGatewayService) {}

  @Post('validar')
  @SkipEnvelope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prevalidar póliza en Sis2000 (RMS → Mundial)',
    description:
      'Usado por el gateway al emitir siniestro (`c_serv=1`). ' +
      'No crea siniestros. Respuesta sin envelope.',
  })
  @ApiBody({ type: RmsSiniestroValidarDto })
  @ApiCrudErrors()
  async validar(@Body() dto: RmsSiniestroValidarDto) {
    const cnpoliza = String(dto.cnpoliza || '').trim();
    if (!cnpoliza) {
      return { status: 'error', cerror: 1, mensaje: 'cnpoliza vacío' };
    }
    const row = await this.rms.loadPolizaRow(cnpoliza);
    if (!row) {
      return {
        status: 'error',
        cerror: 1,
        mensaje: `póliza no existe en Sis2000 (${cnpoliza})`,
      };
    }
    const iestado = String(row['iestado'] ?? '').trim().toUpperCase();
    if (iestado && iestado !== 'V') {
      return {
        status: 'error',
        cerror: 1,
        mensaje: `póliza inactiva (${iestado})`,
      };
    }
    return { status: 'ok', cnpoliza, iestado: iestado || 'V' };
  }
}
