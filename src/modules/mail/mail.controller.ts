import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MailService } from './mail.service';
import { SendPolicyEmailDto } from './dto/send-policy-email.dto';
import { SendFuneralPaymentLinkDto } from './dto/send-funeral-payment-link.dto';
import { SendFuneralReviewAlertDto } from './dto/send-funeral-review-alert.dto';
import { SendFuneralRejectedDto } from './dto/send-funeral-rejected.dto';
import { SendTemplatedMailDto } from './dto/send-templated-mail.dto';
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
      'Acepta una segunda póliza (`cnpoliza_rcv`, `urlpoliza_rcv`, `producto_rcv`…): el asunto y el texto nombran las dos y se adjuntan ambos cuadros. ' +
      'También `url_beneficiario_preferencial` y `attachments` (por url https de hosts permitidos o base64). ' +
      'Máximo 8 adjuntos y 15 MB en total; lo que no se pueda adjuntar se omite sin tumbar el correo y se informa en `adjuntos.omitidos`. ' +
      'Con una sola póliza el correo es el mismo de siempre. ' +
      'Modo `sisip`: proxy a `URL_API_EMAIL` (sendmail_sisip PHP). ' +
      'Requiere `MAIL_ENABLED=true`.',
    operationId: 'sendPolicyEmissionEmail',
  })
  @ApiBody({ type: SendPolicyEmailDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        success: true,
        sent: true,
        mode: 'smtp',
        messageId: '<...@mail.lamundialdeseguros.com>',
        adjuntos: {
          enviados: ['poliza-18-1-0000137515.pdf', 'poliza-26-1-0000137516.pdf', 'recibo-12345678.pdf'],
          omitidos: [{ archivo: 'beneficiario-preferencial-18-1-0000137515.pdf', motivo: 'HTTP 404' }],
        },
      },
    },
  })
  async sendPolicyEmission(@Body() dto: SendPolicyEmailDto) {
    const result = await this.mailService.sendPolicyEmissionEmail(dto);
    return {
      success: result.sent,
      ...result,
    };
  }

  @Post('funeral-payment-link')
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Enviar enlace de pago funerario tras aprobación técnica',
    operationId: 'sendFuneralPaymentLinkEmail',
  })
  @ApiBody({ type: SendFuneralPaymentLinkDto })
  async sendFuneralPaymentLink(@Body() dto: SendFuneralPaymentLinkDto) {
    const result = await this.mailService.sendFuneralPaymentLinkEmail(dto);
    return { success: result.sent, ...result };
  }

  @Post('funeral-review-alert')
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Alerta a autorizadores cuando una emisión funeraria es referida',
    operationId: 'sendFuneralReviewAlertEmail',
  })
  @ApiBody({ type: SendFuneralReviewAlertDto })
  async sendFuneralReviewAlert(@Body() dto: SendFuneralReviewAlertDto) {
    const result = await this.mailService.sendFuneralReviewAlertEmail(dto);
    return { success: result.sent, ...result };
  }

  @Post('funeral-rejected')
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Avisar al tomador que la solicitud funeraria no fue aprobada',
    operationId: 'sendFuneralRejectedEmail',
  })
  @ApiBody({ type: SendFuneralRejectedDto })
  async sendFuneralRejected(@Body() dto: SendFuneralRejectedDto) {
    const result = await this.mailService.sendFuneralRejectedEmail(dto);
    return { success: result.sent, ...result };
  }

  @Post('send')
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Enviar correo con plantilla registrada (reutilizable)',
    description:
      'No acepta HTML libre. `template` elige el diseño (funeral-payment-link, funeral-review-alert, funeral-rejected, branded, expediente-documentos, expediente-codigo, expediente-reporte-diario o expediente-reporte-diario-simple). ' +
      'Adjuntos opcionales en `attachments` (xlsx, csv o pdf, en base64 o por `url` https de un host permitido; máx. 8 y 15 MB en total; ' +
      'si uno no es válido o no se puede descargar responde 400 sin enviar). ' +
      'Los endpoints específicos de funerario siguen vigentes.',
    operationId: 'sendTemplatedEmail',
  })
  @ApiBody({ type: SendTemplatedMailDto })
  async sendTemplated(@Body() dto: SendTemplatedMailDto) {
    const result = await this.mailService.sendTemplatedEmail(dto);
    return { success: result.sent, ...result };
  }
}
