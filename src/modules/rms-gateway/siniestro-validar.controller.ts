import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { ApiCrudErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import {
  RmsSiniestroEmitirDto,
  RmsSiniestroValidarDto,
} from './dto/rms-sync.dto';
import { RmsGatewayService } from './rms-gateway.service';

/**
 * RMS → Sis2000. jws_asegbendisp exige HTTP 200/201; un 400 hace rollback en RMS.
 * Sin envelope para que el gateway lea `status` / `cerror` en la raíz.
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
    summary: 'Prevalidar siniestro en Sis2000 (RMS → Mundial)',
    description:
      'Póliza vigente, fecha dentro de vigencia y recibo cobrado que cubra la ocurrencia. ' +
      'No crea siniestros. HTTP 400 si Sis2000 rechazaría el alta.',
  })
  @ApiBody({ type: RmsSiniestroValidarDto })
  @ApiCrudErrors()
  async validar(@Body() dto: RmsSiniestroValidarDto) {
    return this.rms.validarSiniestro(dto);
  }

  @Post('emitir')
  @SkipEnvelope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Alta de siniestro en Sis2000 (`spGeneraSiniestro`)',
    description:
      'Misma prevalidación que /validar y luego el SP oficial. ' +
      'HTTP 400 (recibos pendientes, etc.) para rollback de RMS. Idempotente por póliza+fecha.',
  })
  @ApiBody({ type: RmsSiniestroEmitirDto })
  @ApiCrudErrors()
  async emitir(@Body() dto: RmsSiniestroEmitirDto) {
    return this.rms.emitirSiniestro(dto);
  }
}
