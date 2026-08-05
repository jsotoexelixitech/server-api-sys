import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EndososService } from './endosos.service';
import { SearchPoliciesDto } from './dto/search-policies.dto';
import { AnularRecibosDto } from './dto/anular-recibos.dto';
import { CrearReciboEndosoDto } from './dto/crear-recibo.dto';
import { AnularPolizaDto } from './dto/anular-poliza.dto';
import { ReactivarPolizaDto } from './dto/reactivar-poliza.dto';
import { CambioDatosPolizaDto } from './dto/cambio-datos-poliza.dto';
import { CambioDatosVehiculoDto } from './dto/cambio-datos-vehiculo.dto';
import { AsientoContableEndosoDto } from './dto/asiento-contable.dto';
import { CalcularPrimaEndosoDto } from './dto/calcular-prima-endoso.dto';
import { ApiCrudErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';

@ApiTags(SWAGGER_TAGS.ENDOSOS)
@Controller('endosos')
export class EndososController {
  constructor(private readonly endososService: EndososService) {}

  // ── 1. Búsqueda y Consulta de Pólizas ─────────────────────────────────────

  @Post('polizas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar y listar pólizas generales',
    description: 'Consulta pólizas registradas aplicando filtros por ramo, número, cédula/RIF, nombre, plan, estatus y paginado.',
  })
  @ApiBody({ type: SearchPoliciesDto })
  @ApiResponse({
    status: 200,
    description: 'Lista de pólizas encontrada',
    schema: {
      example: {
        status: true,
        data: {
          items: [
            {
              cpoliza: 1600000000000189330,
              cnpoliza: '18-1-0000079163',
              cramo: 18,
              fanopol: 2026,
              fmespol: 8,
              cplan: 'BINAC',
              iestado: 'V',
              xasegurado: 'GABRIEL MONCADA',
              cid_asegurado: 'V-12345678',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        },
      },
    },
  })
  @ApiCrudErrors()
  async getPolizas(@Body() dto: SearchPoliciesDto) {
    const data = await this.endososService.getPolizas(dto);
    return { status: true, data };
  }

  @Get('polizas/cedula/:cedula')
  @ApiOperation({
    summary: 'Buscar pólizas por Cédula o RIF',
    description: 'Obtiene el listado de pólizas vigentes e históricas asociadas a un documento de identidad.',
  })
  @ApiParam({ name: 'cedula', example: '12345678', description: 'Cédula o RIF sin guiones' })
  @ApiResponse({
    status: 200,
    description: 'Pólizas asociadas encontradas',
  })
  @ApiCrudErrors()
  async getPolizasByCedula(@Param('cedula') cedula: string) {
    const data = await this.endososService.getPolizasByCedula(cedula);
    return { status: true, data };
  }

  @Get('polizas/:cnpoliza')
  @ApiOperation({
    summary: 'Obtener detalle completo de una póliza',
    description: 'Retorna los datos principales de la póliza, certificado del vehículo (si aplica) y el historial de recibos emitidos.',
  })
  @ApiParam({ name: 'cnpoliza', example: '18-1-0000079163', description: 'Número de póliza completo' })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la póliza',
  })
  @ApiCrudErrors()
  async getPolizaByCnpoliza(@Param('cnpoliza') cnpoliza: string) {
    const data = await this.endososService.getPolizaByCnpoliza(cnpoliza);
    return { status: true, data };
  }

  // ── 2. Operaciones de Endoso y Modificaciones ──────────────────────────────

  @Post('recibos/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular recibos de endoso especificados',
    description: 'Anula una lista de recibos filtrados por cnrecibo cambiando su estado a Anulado (A).',
  })
  @ApiBody({ type: AnularRecibosDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, message: 'Recibos anulados exitosamente.', recibos: ['18-10001'] } },
  })
  @ApiCrudErrors()
  async anularRecibos(@Body() dto: AnularRecibosDto) {
    return await this.endososService.anularRecibos(dto);
  }

  @Post('recibos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear y emitir un nuevo recibo de endoso',
    description: 'Genera el nuevo recibo de endoso en ADRECIBOS, calcula el consecutivo oficial, escala coberturas y corre el reaseguro.',
  })
  @ApiBody({ type: CrearReciboEndosoDto })
  @ApiResponse({
    status: 201,
    schema: { example: { status: true, message: 'Recibo de endoso creado exitosamente.', cnrecibo: '18-10002', crecibo: 180000002 } },
  })
  @ApiCrudErrors()
  async crearRecibo(@Body() dto: CrearReciboEndosoDto) {
    return await this.endososService.crearRecibo(dto);
  }

  @Post('poliza/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular contrato o póliza completa',
    description: 'Marca la póliza y sus certificados/recibos pendientes como Anulados (N / A).',
  })
  @ApiBody({ type: AnularPolizaDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, message: 'Póliza anulada exitosamente.', cnpoliza: '18-1-0000079163' } },
  })
  @ApiCrudErrors()
  async anularPoliza(@Body() dto: AnularPolizaDto) {
    return await this.endososService.anularPoliza(dto);
  }

  @Post('poliza/reactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reversar anulación y reactivar póliza',
    description: 'Revierte la anulación restableciendo el estatus Vigente (V) en la póliza y recibos.',
  })
  @ApiBody({ type: ReactivarPolizaDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, message: 'Reiverso de anulación completado exitosamente.', cnpoliza: '18-1-0000079163' } },
  })
  @ApiCrudErrors()
  async reactivarPoliza(@Body() dto: ReactivarPolizaDto) {
    return await this.endososService.reactivarPoliza(dto);
  }

  @Post('poliza/datos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Modificar tomador, asegurado o beneficiario',
    description: 'Actualiza los datos del titular de la póliza y los propaga a maclient y adpoliza.',
  })
  @ApiBody({ type: CambioDatosPolizaDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, message: 'Cambio de ASEGURADO realizado con éxito.' } },
  })
  @ApiCrudErrors()
  async cambioDatosPoliza(@Body() dto: CambioDatosPolizaDto) {
    return await this.endososService.cambioDatosPoliza(dto);
  }

  @Post('vehiculo/datos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Modificar datos del vehículo en el certificado',
    description: 'Actualiza la placa, seriales, color y marca/modelo/versión en vhcerti.',
  })
  @ApiBody({ type: CambioDatosVehiculoDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, message: 'Cambios al vehículo de la póliza realizados con éxito.' } },
  })
  @ApiCrudErrors()
  async cambioDatosVehiculo(@Body() dto: CambioDatosVehiculoDto) {
    return await this.endososService.cambioDatosVehiculo(dto);
  }

  // ── 3. Asiento Contable y Reporte de Pagos ─────────────────────────────────

  @Post('pagos/asiento')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar asiento contable y procesar cobro del endoso',
    description: 'Registra el pago, cambia el estado del recibo a Cobrado (C) e inserta el movimiento contable (Debe / Haber) en admovasien.',
  })
  @ApiBody({ type: AsientoContableEndosoDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, message: 'Asiento contable y cobro procesados exitosamente.', cnrecibo: '18-10002' } },
  })
  @ApiCrudErrors()
  async asientoContable(@Body() dto: AsientoContableEndosoDto) {
    return await this.endososService.asientoContable(dto);
  }

  // ── 4. Planes, Coberturas y Cálculos ───────────────────────────────────────

  @Get('planes')
  @ApiOperation({
    summary: 'Obtener catálogo de planes disponibles',
    description: 'Retorna los planes configurados opcionalmente filtrados por ramo.',
  })
  @ApiQuery({ name: 'cramo', required: false, example: 18, description: 'Filtrar por ramo' })
  @ApiResponse({ status: 200, description: 'Catálogo de planes' })
  @ApiCrudErrors()
  async getPlanes(@Query('cramo') cramo?: string) {
    const data = await this.endososService.getPlanes(cramo ? Number(cramo) : undefined);
    return { status: true, data };
  }

  @Get('planes/:cplan/coberturas')
  @ApiOperation({
    summary: 'Obtener coberturas asociadas a un plan',
    description: 'Consulta las coberturas, sumas aseguradas y primas parametrizadas para un plan.',
  })
  @ApiParam({ name: 'cplan', example: 'BINAC', description: 'Código del plan' })
  @ApiQuery({ name: 'cramo', required: false, example: 18 })
  @ApiResponse({ status: 200, description: 'Coberturas del plan' })
  @ApiCrudErrors()
  async getCoberturasPlan(@Param('cplan') cplan: string, @Query('cramo') cramo?: string) {
    const data = await this.endososService.getCoberturasPlan(cplan, cramo ? Number(cramo) : undefined);
    return { status: true, data };
  }

  @Post('planes/calcular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calcular prima prorrateada para endoso',
    description: 'Calcula el monto prorrateado de la prima en USD y Bs según la vigencia de días del endoso.',
  })
  @ApiBody({ type: CalcularPrimaEndosoDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        calculation: {
          prorated_amount_usd: 87.5,
          prorated_amount_bs: 44512.5,
          dias_vigencia: 160,
          prima_anual_base_usd: 200.0,
          tasa_cambio: 508.71,
          formula: '(200 USD / 365 días) × 160 días = 87.5 USD',
        },
      },
    },
  })
  @ApiCrudErrors()
  async calcularPrima(@Body() dto: CalcularPrimaEndosoDto) {
    return await this.endososService.calcularPrima(dto);
  }
}
