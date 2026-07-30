import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
  RCV_CREATE_EMISSION_AUTO_BODY,
  RCV_CREATE_EMISSION_AUTO_BODY_WITH_PRIMA,
} from '../../common/swagger/api-docs.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NestApiKey } from '../auth/decorators/nest-api-key.decorator';

@ApiTags('3. Emisión automóvil')
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
    summary: 'Validar placa y serial de carrocería',
    description:
      'Comprueba si la placa o el serial de carrocería ya tienen una póliza vigente.\n\n' +
      '**Validación temprana (antes de elegir plan):** envía solo `placa` y `serial_carroceria`. ' +
      'No incluyas `plan` ni serial de motor.\n\n' +
      '**Re-validación con plan:** incluye `plan` con el código elegido en cotización.\n\n' +
      '**Siguiente paso:** `POST /external/createEmissionAuto`',
    operationId: 'rcvValidateEmissionAuto',
  })
  @ApiBody({
    type: ValidateEmissionAutoDto,
    examples: {
      prePlan: {
        summary: 'Pre-plan (sin plan)',
        description: 'Validación con datos del carnet: placa y serial de carrocería.',
        value: RCV_VALIDATE_PRE_PLAN_BODY,
      },
      withPlan: {
        summary: 'Con plan elegido',
        description: 'Re-validación opcional antes de emitir; `plan` debe coincidir con cotización/emisión.',
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
          error: 'Ya existe una póliza vigente registrada con la misma placa.',
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
          error: 'Ya existe una póliza vigente registrada con el mismo serial de carrocería.',
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
  @NestProtected()
  @ApiOperation({
    summary: 'Emitir póliza de automóvil',
    description:
      'Registra la emisión de la póliza y genera recibo. ' +
      'Devuelve `cnpoliza`, `cnrecibo`, `fanopol`, `fmespol` y URL del PDF.\n\n' +
      '**Siguiente paso:** `POST /external/collection/activate` con el `cnrecibo` y datos del pago.',
    operationId: 'rcvCreateEmissionAuto',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({
    type: CreateEmissionAutoDto,
    description:
      'Acepta alias de campos (`cplan`/`plan`, `xplaca`/`placa`, etc.). ' +
      '**Emisión nueva:** no envíe `poliza` ni `cnpoliza_rel`. ' +
      '**Prima:** omitir o copiar totales de `POST /valrep/cotizacion`; no usar `0`.',
    examples: {
      emisionNueva: {
        summary: 'Emisión nueva (recomendado)',
        description: 'Sin `poliza`. Sin `mprima`/`prima`.',
        value: RCV_CREATE_EMISSION_AUTO_BODY,
      },
      conPrimaCotizacion: {
        summary: 'Con prima de cotización',
        description: 'Tras `POST /valrep/cotizacion`, enviar `mprimaext`, `mprima` y `ptasa` (> 0).',
        value: RCV_CREATE_EMISSION_AUTO_BODY_WITH_PRIMA,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Póliza y recibo generados correctamente.',
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
    @NestApiKey() apikey: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.emissionsService.createEmissionAuto(apikey ?? '', body);
    return { status: true, result };
  }
}
