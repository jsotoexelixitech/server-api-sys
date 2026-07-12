import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EmissionsService } from './emissions.service';
import { CreateEmissionAutoDto } from './dto/create-emission-auto.dto';
import { ValidateEmissionAutoDto } from './dto/validate-emission-auto.dto';
import { SearchVehicleByPlateDto, SearchVehicleBySerialDto } from './dto/search-vehicle.dto';
import { Api401, Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiTags('Emisión Automóvil (RCV)')
@Controller('v1')
export class EmissionsController {
  constructor(private readonly emissionsService: EmissionsService) {}

  // ── POST /api/v1/emissions/automobile/vehicle ─────────────────────────────

  @Post('emissions/automobile/vehicle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar vehículo por placa',
    description: 'Consulta `vhcerti` y `adpoliza`. Devuelve `found: true` y datos del vehículo si tiene póliza vigente.',
  })
  @ApiBody({ type: SearchVehicleByPlateDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: { found: true, message: 'El vehículo ya tiene una póliza vigente (PLACA)', vehicle: { xplaca: 'AE886C20', xsercar: 'SC1...', cmarca: '083', fano: 2004 } },
      },
    },
  })
  @ApiCommonErrors()
  async searchByPlate(@Body() dto: SearchVehicleByPlateDto) {
    return await this.emissionsService.searchByPlate(dto.xplaca ?? '');
  }

  // ── POST /api/v1/emissions/automobile/serial ──────────────────────────────

  @Post('emissions/automobile/serial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar vehículo por serial de carrocería',
    description: 'Consulta `vhcerti` y `adpoliza`. Acepta `xsercar` o `xserialcarroceria` (ambos nombres son equivalentes).',
  })
  @ApiBody({ type: SearchVehicleBySerialDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: false,
        vehicle: { xplaca: 'AE886C20', xsercar: 'SC1S6ZMV3024320' },
      },
    },
  })
  @ApiCommonErrors()
  async searchBySerial(@Body() dto: SearchVehicleBySerialDto) {
    const serial = dto.xsercar ?? dto.xserialcarroceria ?? '';
    return await this.emissionsService.searchBySerial(serial);
  }


  // ── POST /api/v1/external/validateEmissionAuto ────────────────────────────

  @Post('external/validateEmissionAuto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar automóvil para emisión',
    description:
      'Ejecuta `speeValidateAutomovilGeneral`. ' +
      'Verifica que la placa/serial no tenga póliza vigente activa. ' +
      'Devuelve `status: false` con motivo si el vehículo no puede asegurarse.',
  })
  @ApiBody({ type: ValidateEmissionAutoDto })
  @ApiResponse({ status: 200, schema: { example: { status: true, result: { status: true, message: 'Vehículo válido para emisión.' } } } })
  @ApiResponse({
    status: 200,
    description: 'Validación rechazada (status: false)',
    schema: { example: { status: false, result: { status: false, error: 'Se ha detectado la existencia de una póliza vigente con la misma placa del vehículo.' } } },
  })
  @ApiCommonErrors()
  async validateEmissionAuto(@Body() dto: ValidateEmissionAutoDto) {
    const result = await this.emissionsService.validateEmissionAuto(dto as unknown as Record<string, unknown>);
    return { status: result.status, result };
  }

  // ── POST /api/v1/external/createEmissionAuto ──────────────────────────────

  @Post('external/createEmissionAuto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Emitir póliza de automóvil RCV',
    description:
      'Ejecuta `sp_pre_emision_Automovil_RCV2` (flujo fb_organizacion_swagger). ' +
      'Requiere header `apikey` (se valida contra `maclient_api`). ' +
      'Devuelve `cnpoliza`, `fanopol` y `fmespol` para construir la URL del PDF.',
  })
  @ApiHeader({ name: 'apikey', description: 'Token de autenticación del canal emisor (opcional en QA interno)', required: false, example: 'tu-api-key' })
  @ApiBody({ type: CreateEmissionAutoDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        result: { message: 'Emisión registrada exitosamente.', cnpoliza: '18-1-0000011500', fanopol: 2025, fmespol: 6 },
      },
    },
  })
  @Api401()
  @ApiCommonErrors()
  async createEmissionAuto(
    @Headers('apikey') apikey: string,
    @Body() body: Record<string, unknown>,
  ) {
    // Sin DTO class-validator: acepta formato La Mundial (cplan, xplaca, femision)
    // y formato interno (plan, placa, fecha_emision) — validación en EmissionsService.
    const result = await this.emissionsService.createEmissionAuto(apikey ?? '', body);
    return { status: true, result };
  }
}
