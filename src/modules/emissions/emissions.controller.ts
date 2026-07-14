import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { EmissionsService } from './emissions.service';
import { CreateEmissionAutoDto } from './dto/create-emission-auto.dto';
import { ValidateEmissionAutoDto } from './dto/validate-emission-auto.dto';
import { SearchVehicleByPlateDto, SearchVehicleBySerialDto } from './dto/search-vehicle.dto';
import { Api401, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import {
  APIKEY_HEADER,
  RCV_COTIZACION_EXAMPLE,
  RCV_EMISSION_EXAMPLE,
} from '../../common/swagger/api-docs.constants';

@ApiTags('3. Emisión Automóvil (RCV)')
@Controller('v1')
export class EmissionsController {
  constructor(private readonly emissionsService: EmissionsService) {}

  @Post('emissions/automobile/vehicle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 5a · Buscar vehículo por placa',
    description:
      'Consulta `vhcerti` + `adpoliza`. Útil antes de emitir para detectar póliza vigente. ' +
      'Complementa `validateEmissionAuto` (este endpoint es informativo; la validación formal es el paso 5b).',
    operationId: 'rcvSearchVehicleByPlate',
  })
  @ApiBody({ type: SearchVehicleByPlateDto })
  @ApiResponse({
    status: 200,
    description: 'Vehículo encontrado con o sin póliza vigente.',
    schema: {
      example: {
        status: true,
        data: {
          found: true,
          message: 'El vehículo ya tiene una póliza vigente (PLACA)',
          vehicle: { xplaca: 'AE886C20', xsercar: 'SC1S6ZMV3024320', cmarca: '074', fano: 2004 },
        },
      },
    },
  })
  @ApiCommonErrors()
  async searchByPlate(@Body() dto: SearchVehicleByPlateDto) {
    return await this.emissionsService.searchByPlate(dto.xplaca ?? '');
  }

  @Post('emissions/automobile/serial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 5a · Buscar vehículo por serial',
    description:
      'Igual que búsqueda por placa pero usando serial de carrocería. ' +
      'Acepta `xsercar` o `xserialcarroceria`.',
    operationId: 'rcvSearchVehicleBySerial',
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

  @Post('external/validateEmissionAuto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 5b · Validar vehículo para emisión',
    description:
      'Ejecuta `speeValidateAutomovilGeneral`. Bloquea emisión si existe póliza vigente con la misma placa o serial.\n\n' +
      '**Siguiente paso:** `POST /external/createEmissionAuto`',
    operationId: 'rcvValidateEmissionAuto',
  })
  @ApiBody({ type: ValidateEmissionAutoDto })
  @ApiResponse({
    status: 200,
    description: 'Vehículo apto para emisión.',
    schema: {
      example: { status: true, result: { status: true, message: 'Vehículo válido para emisión.' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Validación rechazada.',
    schema: {
      example: {
        status: false,
        result: {
          status: false,
          error: 'Se ha detectado la existencia de una póliza vigente con la misma placa del vehículo.',
        },
      },
    },
  })
  @ApiCommonErrors()
  async validateEmissionAuto(@Body() dto: ValidateEmissionAutoDto) {
    const result = await this.emissionsService.validateEmissionAuto(dto as unknown as Record<string, unknown>);
    return { status: result.status, result };
  }

  @Post('external/createEmissionAuto')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('apikey')
  @ApiOperation({
    summary: 'Paso 6 · Emitir póliza RCV',
    description:
      'Ejecuta `sp_pre_emision_Automovil_RCV2` → `sp_emision_Automovil_RCV2` → `spGeneraCoberturasYRecibos_Auto_RCV2`.\n\n' +
      'Devuelve `cnpoliza`, `cnrecibo`, `fanopol`, `fmespol` y URL del PDF.\n\n' +
      '**Siguiente paso (Exélixi):** `POST /external/collection/activate` con el `cnrecibo` y datos del pago móvil.',
    operationId: 'rcvCreateEmissionAuto',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({
    type: CreateEmissionAutoDto,
    description:
      'Acepta formato La Mundial (`cplan`, `xplaca`, `femision`) e interno Exélixi (`plan`, `placa`). ' +
      'Campos extra del formulario se ignoran sin error.',
  })
  @ApiResponse({
    status: 200,
    description: 'Póliza y recibo creados en Sis2000.',
    schema: {
      example: {
        status: true,
        result: {
          message: 'Póliza generada exitosamente',
          cnpoliza: RCV_EMISSION_EXAMPLE.cnpoliza,
          cnrecibo: RCV_EMISSION_EXAMPLE.cnrecibo,
          fanopol: RCV_EMISSION_EXAMPLE.fanopol,
          fmespol: RCV_EMISSION_EXAMPLE.fmespol,
          urlpoliza: RCV_EMISSION_EXAMPLE.urlpoliza,
          quote: RCV_COTIZACION_EXAMPLE,
        },
      },
    },
  })
  @Api401()
  @ApiCommonErrors()
  async createEmissionAuto(
    @Headers('apikey') apikey: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.emissionsService.createEmissionAuto(apikey ?? '', body);
    return { status: true, result };
  }
}
