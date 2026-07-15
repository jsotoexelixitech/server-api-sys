import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeEndpoint,
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
  RCV_VALIDATE_PRE_PLAN_BODY,
  RCV_VALIDATE_WITH_PLAN_BODY,
} from '../../common/swagger/api-docs.constants';

@ApiTags('3. Emisión RCV')
@Controller('v1')
export class EmissionsController {
  constructor(private readonly emissionsService: EmissionsService) {}

  @Post('emissions/automobile/vehicle')
  @ApiExcludeEndpoint()
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
  @ApiExcludeEndpoint()
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
    summary: 'Validar placa/serial (pre-plan o con plan)',
    description:
      'Ejecuta `speeValidateAutomovilGeneral`. Comprueba en Sis2000 si la placa o el serial ya tienen póliza vigente.\n\n' +
      '**Uso 1 — Formulario Exélixi (antes de elegir plan):** envía solo `placa` y `serial_carroceria` (carnet de circulación). ' +
      'No incluyas `plan` (el servidor usa `LAMUNDIAL_PLAN_DEFAULT` / `RCVBAS`) ni serial de motor.\n\n' +
      '**Uso 2 — Re-validación con plan:** incluye `plan` con el código elegido en cotización (debe coincidir al emitir).\n\n' +
      '**Probar en Swagger:** Try it out → ejemplo *Pre-plan (sin plan)* → Execute.\n\n' +
      '**curl (solo carnet):**\n' +
      '```\n' +
      'curl -X POST http://localhost:3002/api/v1/external/validateEmissionAuto \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      '  -d \'{"placa":"AE886C","serial_carroceria":"SC1S6ZMV3024323"}\'\n' +
      '```\n\n' +
      '**Siguiente paso (tras planes/cotización):** `POST /external/createEmissionAuto`',
    operationId: 'rcvValidateEmissionAuto',
  })
  @ApiBody({
    type: ValidateEmissionAutoDto,
    examples: {
      prePlan: {
        summary: 'Pre-plan (sin plan) — Formulario Exélixi',
        description:
          'Validación temprana con datos del carnet: placa + serial de carrocería. Sin plan ni serial de motor.',
        value: RCV_VALIDATE_PRE_PLAN_BODY,
      },
      withPlan: {
        summary: 'Con plan elegido',
        description: 'Re-validación opcional antes de emitir; `plan` debe ser el mismo que en cotización/emisión.',
        value: RCV_VALIDATE_WITH_PLAN_BODY,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Vehículo apto para emisión.',
    schema: {
      example: {
        status: true,
        result: {
          status: true,
          message: 'El vehículo puede asegurarse. No hay póliza vigente con esta placa ni serial.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Póliza vigente detectada por placa.',
    schema: {
      example: {
        status: false,
        result: {
          status: false,
          code: 'PLATE_ALREADY_INSURED',
          error: 'Ya existe una póliza vigente registrada con la misma placa. Verifica los datos del carnet de circulación.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Póliza vigente detectada por serial de carrocería.',
    schema: {
      example: {
        status: false,
        result: {
          status: false,
          code: 'SERIAL_ALREADY_INSURED',
          error:
            'Ya existe una póliza vigente registrada con el mismo serial de carrocería. Verifica los datos del carnet de circulación.',
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
