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

const APIKEY_HEADER = {
  name: 'apikey',
  description:
    'Token del canal en `maclient_api`. Obligatorio en producción; en QA interno puede omitirse.',
  required: false,
};

const ACTIVATE_BODY_EXAMPLE = {
  cnrecibo: '18-100272044',
  mpago: 7.24,
  xreferencia: '219551279300',
  fpago: '2026-07-14',
  cbanco_ref: '0134',
};

@ApiTags('Cobranza (Collection)')
@Controller('v1/external/collection')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar recibos pendientes por RIF/cédula',
    description:
      'Ejecuta `spSearchForCustomerByReceipt`. Devuelve recibos con `iestadorec` pendiente de cobro para el cliente.',
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
  @ApiBody({ type: CollectionPaymentDto, examples: { pagoMovil: { value: ACTIVATE_BODY_EXAMPLE } } })
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
    summary: 'Activar recibo tras pago bancario (recomendado Exélixi)',
    description:
      'Endpoint usado por **emision-api** tras emitir la póliza. ' +
      'Flujo validado en QA (ingreso #183034):\n' +
      '1. `buildCollectionPayload` — resuelve bancos desde `pago_movil` / referencia\n' +
      '2. `spCobroSis_Ad` — crea ingreso en `cbreporte_tran` y marca recibo cobrado\n' +
      '3. UPSERT en `cbreporte_pago` — banco origen, banco destino (35), `ctipopago` (3), `freporte`\n\n' +
      'No ejecuta `spNotificaPago`. PDF ingreso de caja: `/sis2000/ingreso_caja/{transaccion}/`.',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({
    type: CollectionPaymentDto,
    examples: {
      pagoMovil: {
        summary: 'Pago móvil verificado (caso Exélixi)',
        value: ACTIVATE_BODY_EXAMPLE,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Recibo cobrado; ingreso de caja generado.',
    schema: {
      example: {
        status: true,
        result: {
          message: 'Recibo cobrado exitosamente.',
          cobro: {
            transaccion: 183034,
            cnpoliza: '18-1-0000078926',
            fanopol: 2026,
            fmespol: 7,
            mensaje: 'Cobro realizado.',
          },
        },
      },
    },
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
