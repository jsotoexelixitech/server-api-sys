import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestApiKey } from '../auth/decorators/nest-api-key.decorator';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { AutopagoService } from './autopago.service';
import { MarcarEmitidaDto } from './dto/marcar-emitida.dto';
import { RegistrarVentaDto } from './dto/registrar-venta.dto';

@ApiTags(SWAGGER_TAGS.AUTOPAGO)
@Controller('v1/autopago')
export class AutopagoController {
  constructor(private readonly autopago: AutopagoService) {}

  @Get('productos')
  @NestProtected(NEST_AUTH_SCOPES.AUTOPAGO_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'API 1 · Catálogo de productos (SKU) del canal',
    description:
      'SKU comerciales habilitados para el canal de la API key (Sis2000 `taprodsku` → producto, ramo y plan). ' +
      'El POS solo necesita el `csku`; la homologación a ramo/plan la hace La Mundial.',
    operationId: 'autopagoProductos',
  })
  @ApiQuery({ name: 'ccanalalt', required: false, description: 'Solo pruebas: canal si la API key no tiene uno.' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          ccanalalt: 8,
          productos: [
            { csku: '12444564', cproducto: '23', cramo: 18, cplan: 'FARMPA', xproducto: 'RCV Particular', xplan: 'Plan Farmatodo', tipo_formulario: 'rcv', mmonto: null },
          ],
        },
      },
    },
  })
  @ApiCommonErrors()
  async productos(@NestApiKey() apikey: string, @Query('ccanalalt') ccanalalt?: string) {
    const canal = await this.autopago.resolveCanal(apikey, ccanalalt ? Number(ccanalalt) : null);
    const productos = await this.autopago.listarProductos(canal.ccanalalt);
    return { status: true, data: { ccanalalt: canal.ccanalalt, cantidad: productos.length, productos } };
  }

  @Post('ventas')
  @NestProtected(NEST_AUTH_SCOPES.AUTOPAGO_WRITE)
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'API 2 · Registrar venta en caja y generar enlaces de emisión',
    description:
      'Recibe el ticket (cliente, factura y SKU con cantidades), crea **un enlace de emisión por unidad** y lo envía ' +
      'al correo del cliente. Cada enlace abre el flujo de emisión con la compra ya pagada (sin paso de cobro) y ' +
      'queda inactivo al emitir la póliza. Idempotente: la misma `nfactura` del canal devuelve el registro existente.',
    operationId: 'autopagoRegistrarVenta',
  })
  @ApiBody({ type: RegistrarVentaDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        message: 'Transacción registrada exitosamente',
        data: {
          codigo_registro: 'AP-000012',
          nfactura: '4829104851',
          emisiones_autorizadas: 2,
          emisiones: [
            {
              ncorrelativo: 1,
              csku: '12444564',
              xproducto: 'RCV Particular',
              iestado: 'P',
              url_emision: 'https://cierrelmds.exelixitech.com/ocr/tarjeta?ap=Qm1…',
              expires_at: '2026-11-25T14:30:00.000Z',
            },
          ],
          correo: { destinatario: 'carlos.mendoza@email.com', enviados: 2, pendientes: 2, errores: [] },
        },
      },
    },
  })
  @ApiResponse({
    status: 422,
    schema: {
      example: { success: false, code: 'SKU_NO_CONFIGURADO', message: 'SKU sin producto configurado para el canal 8: 999.' },
    },
  })
  @ApiCommonErrors()
  async registrarVenta(@Body() dto: RegistrarVentaDto, @NestApiKey() apikey: string) {
    return this.autopago.registrarVenta(dto, apikey);
  }

  @Get('ventas/:nfactura')
  @NestProtected(NEST_AUTH_SCOPES.AUTOPAGO_WRITE)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Estado de una venta (emisiones pendientes y emitidas)',
    operationId: 'autopagoConsultarVenta',
  })
  @ApiParam({ name: 'nfactura', example: '4829104851' })
  @ApiQuery({ name: 'ccanalalt', required: false })
  @ApiCommonErrors()
  async consultarVenta(
    @Param('nfactura') nfactura: string,
    @NestApiKey() apikey: string,
    @Query('ccanalalt') ccanalalt?: string,
  ) {
    return this.autopago.consultarVenta(apikey, String(nfactura).trim(), ccanalalt ? Number(ccanalalt) : null);
  }

  @Post('emisiones/:token/reenviar')
  @NestProtected(NEST_AUTH_SCOPES.AUTOPAGO_WRITE)
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({ summary: 'Reenviar el correo de un enlace pendiente', operationId: 'autopagoReenviarCorreo' })
  @ApiParam({ name: 'token' })
  @ApiCommonErrors()
  async reenviar(@Param('token') token: string) {
    return this.autopago.reenviarCorreo(token);
  }

  @Get('emisiones/:token')
  @Public()
  @ApiOperation({
    summary: 'Datos del enlace de emisión (lo consume el flujo web de emisión)',
    description:
      'Público: el token es el secreto. Devuelve la compra en la misma forma que una tarjeta validada ' +
      '(`bfactura=1`, plan, ramo, canal, cliente). 409 si ya se emitió, 410 si venció o fue anulada.',
    operationId: 'autopagoConsultarEnlace',
  })
  @ApiParam({ name: 'token' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        success: true,
        data: {
          resultado: 1,
          xcodigo_unico: 'Qm1…',
          bfactura: 1,
          nfactura: '4829104851',
          cplan: 'FARMPA',
          cramo: 18,
          ccanalalt: 8,
          cproducto: '23',
          nombre_producto: 'RCV Particular',
          tipo_formulario: 'rcv',
          autopago: { token: 'Qm1…', ncorrelativo: 1, total: 2, cliente: { cci_rif: '18459203', xcliente: 'Carlos Mendoza' } },
        },
      },
    },
  })
  @ApiResponse({ status: 409, schema: { example: { success: false, code: 'AUTOPAGO_EMITIDA', message: 'Este enlace ya fue utilizado…' } } })
  async consultarEnlace(@Param('token') token: string) {
    return this.autopago.consultarToken(token);
  }

  @Post('emisiones/:token/emitida')
  @NestProtected()
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Marcar el enlace como emitido (token quemado)',
    description: 'Lo llama emision-api tras emitir la póliza con el enlace. Idempotente.',
    operationId: 'autopagoMarcarEmitida',
  })
  @ApiParam({ name: 'token' })
  @ApiBody({ type: MarcarEmitidaDto })
  @ApiCommonErrors()
  async marcarEmitida(@Param('token') token: string, @Body() dto: MarcarEmitidaDto) {
    return this.autopago.marcarEmitida(token, dto);
  }
}
