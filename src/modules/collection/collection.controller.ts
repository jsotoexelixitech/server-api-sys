import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { CollectionSearchDto } from './dto/collection-search.dto';
import { CollectionPaymentDto } from './dto/collection-payment.dto';
import { Api401, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import {
  APIKEY_HEADER,
  RCV_COLLECTION_ACTIVATE_BODY,
  RCV_COLLECTION_ACTIVATE_RESPONSE,
} from '../../common/swagger/api-docs.constants';

@ApiTags('4. Cobranza RCV')
@Controller('v1/external/collection')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Post('search')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar recibos pendientes por RIF/cédula',
    description: 'Opcional. Ejecuta `spSearchForCustomerByReceipt` para listar recibos sin cobrar.',
    operationId: 'collectionSearchByClient',
  })
  @ApiBody({ type: CollectionSearchDto })
  @ApiResponse({
    status: 200,
    description: 'Búsqueda exitosa (puede devolver lista vacía).',
    schema: {
      example: {
        status: true,
        message: 'Operación exitosa',
        result: { data: [{ cnrecibo: '18-100272044', cnpoliza: '18-1-0000078926', mmontorec: 7.24 }] },
      },
    },
  })
  @ApiCommonErrors()
  async search(@Body() dto: CollectionSearchDto) {
    const result = await this.collectionService.searchByClient(dto.cci_rif);
    return { status: true, message: 'Operación exitosa', result };
  }

  @Post('notific')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('apikey')
  @ApiOperation({
    summary: '[Legacy] Notificar pago (spNotificaPago)',
    description:
      'Ruta heredada de SysIP. Registra notificación previa al cobro. ' +
      '**Exélixi RCV no usa este endpoint** — usar `POST /activate`.',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: CollectionPaymentDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        message: 'Notificación registrada.',
        result: { transaccion: 183034, mensaje: 'Cobro realizado.', ptasamon: 723.999 },
      },
    },
  })
  @Api401()
  @ApiCommonErrors()
  async notific(
    @Headers('apikey') apikey: string,
    @Body() dto: CollectionPaymentDto,
  ) {
    const payload = await this.collectionService.buildCollectionPayload(apikey ?? '', dto);
    const result = await this.collectionService.notifyPayment(payload);
    return { status: true, message: 'Notificación registrada.', result };
  }

  @Post('collect')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('apikey')
  @ApiOperation({
    summary: 'Cobrar recibo (spCobroSis_Ad + soporte)',
    description:
      'Igual que `activate` pero sin alias de respuesta Exélixi. ' +
      'Flujo: `buildCollectionPayload` → `spCobroSis_Ad` → UPSERT en `cbreporte_pago` ' +
      '(banco origen/destino, `ctipopago`, `freporte`). Alineado con SysIP `collectReceip`.',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: CollectionPaymentDto, examples: { pagoMovil: { value: RCV_COLLECTION_ACTIVATE_BODY } } })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        message: 'Cobro registrado.',
        result: {
          transaccion: 183034,
          cnpoliza: '18-1-0000078926',
          fanopol: 2026,
          fmespol: 7,
          mensaje: 'Cobro realizado.',
        },
      },
    },
  })
  @Api401()
  @ApiCommonErrors()
  async collect(
    @Headers('apikey') apikey: string,
    @Body() dto: CollectionPaymentDto,
  ) {
    const payload = await this.collectionService.buildCollectionPayload(apikey ?? '', dto);
    const result = await this.collectionService.collectPayment(payload);
    return { status: true, message: 'Cobro registrado.', result };
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('apikey')
  @ApiOperation({
    summary: 'Paso 7 · Activar recibo tras pago (recomendado Exélixi)',
    description:
      'Usado por **emision-api** tras emitir. Flujo validado QA (ingreso **#183034**):\n\n' +
      '1. `buildCollectionPayload` — bancos desde `pago_movil`\n' +
      '2. `spCobroSis_Ad` — ingreso en `cbreporte_tran`\n' +
      '3. UPSERT `cbreporte_pago` — banco origen/destino, `ctipopago`=3, `freporte`\n\n' +
      'PDF: `https://qaapi.lamundialdeseguros.com/sis2000/ingreso_caja/{transaccion}/`',
    operationId: 'rcvActivateReceipt',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({
    type: CollectionPaymentDto,
    examples: {
      pagoMovil: {
        summary: 'Pago móvil verificado (caso Exélixi jul-2026)',
        value: RCV_COLLECTION_ACTIVATE_BODY,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Recibo cobrado; ingreso de caja generado.',
    schema: { example: RCV_COLLECTION_ACTIVATE_RESPONSE },
  })
  @Api401()
  @ApiCommonErrors()
  async activate(
    @Headers('apikey') apikey: string,
    @Body() dto: CollectionPaymentDto,
  ) {
    const result = await this.collectionService.activateReceipt(apikey ?? '', dto);
    return { status: true, result };
  }
}
