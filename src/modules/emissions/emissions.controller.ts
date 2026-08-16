import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
import { SearchProprietaryDto } from './dto/search-proprietary.dto';
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
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { NestApiKey } from '../auth/decorators/nest-api-key.decorator';

@ApiTags('3. Emisión automóvil')
@Controller('v1')
export class EmissionsController {
  constructor(private readonly emissionsService: EmissionsService) {}

  @Post('emissions/automobile/vehicle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar placa activa (fn_validar_placa)',
    description:
      'Migración de SysIP Express `POST /api/v1/emissions/automobile/vehicle`.\n\n' +
      'Ejecuta `dbo.fn_validar_placa(@xplaca, @fdesde)`.\n\n' +
      '- Placa con póliza/vigencia conflictiva → `{ status: true, message, is_active: true }`\n' +
      '- Placa disponible → `{ status: false, is_active: false }`\n\n' +
      'Si `type` es exactamente `warning`, el mensaje es de advertencia; en otro caso es el mensaje definitivo.\n\n' +
      'Acepta alias `placa` ↔ `xplaca`.',
    operationId: 'rcvSearchVehicleByPlate',
  })
  @ApiBody({
    type: SearchVehicleByPlateDto,
    examples: {
      warning: {
        summary: 'Mensaje de advertencia',
        value: { xplaca: 'AE218EG', fdesde: '2026-01-01', type: 'warning' },
      },
      final: {
        summary: 'Mensaje definitivo',
        value: { xplaca: 'AE218EG', fdesde: '2026-01-01' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Placa ya registrada/activa.',
    schema: {
      example: {
        status: true,
        is_active: true,
        message:
          'Lo sentimos, el campo PLACA ingresado ya se encuentra registrado y activo en el sistema',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Placa disponible.',
    schema: {
      example: { status: false, is_active: false },
    },
  })
  @ApiResponse({ status: 400, description: 'Falta `xplaca`/`placa` o `fdesde`.' })
  @ApiCommonErrors()
  async searchByPlate(@Body() dto: SearchVehicleByPlateDto) {
    return await this.emissionsService.searchByPlate(dto);
  }

  @Post('emissions/automobile/serial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar serial de carrocería activo (fn_validar_serialCar)',
    description:
      'Migración de SysIP Express `POST /api/v1/emissions/automobile/serial`.\n\n' +
      'Ejecuta `dbo.fn_validar_serialCar(@xsercar, @fdesde)`.\n\n' +
      '- Serial con póliza/vigencia conflictiva → `{ status: true, message, is_active: true }`\n' +
      '- Serial disponible → `{ status: false, is_active: false }`\n\n' +
      'Si `type` es exactamente `warning`, el mensaje es de advertencia; en otro caso es el mensaje definitivo.\n\n' +
      'Acepta alias `xserialcarroceria` ↔ `xsercar`.',
    operationId: 'rcvSearchVehicleBySerial',
  })
  @ApiBody({
    type: SearchVehicleBySerialDto,
    examples: {
      warning: {
        summary: 'Mensaje de advertencia',
        value: { xsercar: 'KNAFC526365439484', fdesde: '2026-01-01', type: 'warning' },
      },
      alias: {
        summary: 'Con alias xserialcarroceria',
        value: { xserialcarroceria: 'KNAFC526365439484', fdesde: '2026-01-01' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Serial ya registrado/activo.',
    schema: {
      example: {
        status: true,
        is_active: true,
        message:
          'Lo sentimos, el campo SERIAL DE CARROCERÍA ingresado ya se encuentra registrado y activo en el sistema',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Serial disponible.',
    schema: {
      example: { status: false, is_active: false },
    },
  })
  @ApiResponse({ status: 400, description: 'Falta `xsercar`/`xserialcarroceria` o `fdesde`.' })
  @ApiCommonErrors()
  async searchBySerial(@Body() dto: SearchVehicleBySerialDto) {
    return await this.emissionsService.searchBySerial(dto);
  }

  @Post('emissions/automobile_new/propietary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar propietario/cliente por CID (flujo auto nuevo)',
    description:
      'Migración de SysIP Express `POST /api/v1/emissions/automobile_new/propietary`.\n\n' +
      'Consulta `maclient` con joins de dirección, correo, teléfono, estado/ciudad y atributos ' +
      '(profesión, ocupación, actividad).\n\n' +
      '**Importante:** el body legacy `xrif_cliente` se filtra contra `maclient.cid` (no `cci_rif`). ' +
      'Acepta alias `cid`.\n\n' +
      'Respuesta: `data` (Nest) e `info` (compat Express).',
    operationId: 'rcvSearchNewProprietary',
  })
  @ApiBody({ type: SearchProprietaryDto })
  @ApiResponse({
    status: 200,
    description: 'Propietario encontrado.',
    schema: {
      example: {
        status: true,
        data: {
          xnombre: 'JUAN',
          xapellido: 'PEREZ',
          fnacimiento: '1990-01-13',
          isexo: 'M',
          ipersona: 'V',
          iestado_civil: 'S',
          cestado: 1,
          xestado: 'DISTRITO CAPITAL',
          cciudad: 128,
          cci_rif: '12345678',
          cid: 'V12345678',
          xciudad: 'CARACAS',
          xavecalle: 'AV PRINCIPAL',
          xcorreo: 'juan@email.com',
          xtelefono: '04141234567',
          cliente: 'JUAN PEREZ',
          es_mayor_de_edad: 1,
          xprofesion: '',
          xocupacion: '',
          xactividad: '',
        },
        info: { cid: 'V12345678', xnombre: 'JUAN' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Falta `xrif_cliente` / `cid`.' })
  @ApiResponse({ status: 404, description: 'Propietario no encontrado.' })
  @ApiCommonErrors()
  async searchNewProprietary(@Body() dto: SearchProprietaryDto) {
    return await this.emissionsService.searchNewProprietary(dto);
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
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
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
