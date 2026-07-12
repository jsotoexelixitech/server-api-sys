import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { CollectionSearchDto } from './dto/collection-search.dto';
import { CollectionPaymentDto } from './dto/collection-payment.dto';
import { Api401, ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiTags('Cobranza (Collection)')
@Controller('v1/external/collection')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buscar recibos pendientes por RIF/cédula' })
  @ApiBody({ type: CollectionSearchDto })
  @ApiResponse({ status: 200, schema: { example: { status: true, result: { data: [] } } } })
  @ApiCommonErrors()
  async search(@Body() dto: CollectionSearchDto) {
    const result = await this.collectionService.searchByClient(dto.cci_rif);
    return { status: true, message: 'Operación exitosa', result };
  }

  @Post('notific')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Notificar pago de recibo (spNotificaPago)' })
  @ApiHeader({ name: 'apikey', description: 'Token del canal (opcional en QA interno; default Exelixi)', required: false })
  @ApiBody({ type: CollectionPaymentDto })
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
  @ApiOperation({ summary: 'Cobrar recibo notificado (spCobroSis_Ad)' })
  @ApiHeader({ name: 'apikey', description: 'Token del canal (opcional en QA interno; default Exelixi)', required: false })
  @ApiBody({ type: CollectionPaymentDto })
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
  @ApiOperation({
    summary: 'Notificar + cobrar en un paso (activar recibo tras pago bancario)',
  })
  @ApiHeader({ name: 'apikey', description: 'Token del canal (opcional en QA interno; default Exelixi)', required: false })
  @ApiBody({ type: CollectionPaymentDto })
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
