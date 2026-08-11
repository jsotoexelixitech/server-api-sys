import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MailService } from './mail.service';
import { SendPolicyEmailDto } from './dto/send-policy-email.dto';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';

@ApiTags('6. Correo')
@Controller('v1/mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('policy-emission')
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Enviar documentos de póliza emitida por correo',
    description:
      'Modo `smtp`: plantilla welcome (SysIP) + adjuntos PDF desde URLs. ' +
      'Modo `sisip`: proxy a `URL_API_EMAIL` (sendmail_sisip PHP). ' +
      'Requiere `MAIL_ENABLED=true`.',
    operationId: 'sendPolicyEmissionEmail',
  })
  @ApiBody({ type: SendPolicyEmailDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: { sent: true, mode: 'smtp', messageId: '<...@mail.lamundialdeseguros.com>' },
    },
  })
  async sendPolicyEmission(@Body() dto: SendPolicyEmailDto) {
    const result = await this.mailService.sendPolicyEmissionEmail(dto);
    return {
      success: result.sent,
      ...result,
    };
  }
}
