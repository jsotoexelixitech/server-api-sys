import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PersonasService } from './personas.service';
import { GetPlanesPerDto } from './dto/get-planes-per.dto';
import { CotizacionPerDto } from './dto/cotizacion-per.dto';
import { CreateEmissionPersonDto } from './dto/create-emission-person.dto';
import { ValidateEmissionPersonDto } from '../emissions/dto/validate-emission-person.dto';
import { Api401, Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';

@ApiTags('6. Emisión personas')
@Controller('v1/personas')
export class PersonasController {
  constructor(private readonly personasService: PersonasService) {}

  // ── POST /api/v1/personas/planes ──────────────────────────────────────────

  @Post('planes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Planes de personas vigentes (ramo 9 = Funerario)',
    description:
      'Planes de personas vigentes para el ramo indicado (9 = funerario por defecto), ' +
      'con parentescos y rangos de edad permitidos.',
  })
  @ApiBody({ type: GetPlanesPerDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: { planes: [{ cplan: 'FUNBAS', xplan: 'Plan Funerario Básico', cramo: 9, cmoneda: 'USD', parentescos: [{ cparen: 1, xparentesco: 'TITULAR', min_edad: 18, max_edad: 75 }] }] },
      },
    },
  })
  @Api500()
  async getPlanes(@Body() dto: GetPlanesPerDto) {
    const planes = await this.personasService.getPlanesPer(dto.cramo, dto.ctipo ?? null);
    return { status: true, data: { planes } };
  }

  // ── POST /api/v1/personas/cotizacion ──────────────────────────────────────

  @Post('cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar póliza de personas',
    description:
      'Calcula la prima por cada asegurado y devuelve totales en USD (`mprimaext`), bolívares (`mprima`) y tasa (`ptasa`).',
  })
  @ApiBody({ type: CotizacionPerDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, data: { mprimaext: 120.5, mprima: 61286.3, ptasa: 508.6 } } },
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos o prima = 0.' })
  @Api500()
  async cotizar(@Body() dto: CotizacionPerDto) {
    const data = await this.personasService.getCotizacionPer(dto);
    return { status: true, data };
  }

  // ── POST /api/v1/personas/validacion ───────────────────────────────────────

  @Post('validacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Funerario paso 5 · Validar emisión de personas',
    description: 'Valida que el asegurado cumple las reglas de negocio antes de emitir la póliza de personas.',
    operationId: 'funerarioPersonasValidacion',
  })
  @ApiBody({ type: ValidateEmissionPersonDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, result: { status: true, message: 'Persona válida para emisión.' } } },
  })
  @ApiResponse({
    status: 200,
    description: 'Validación rechazada (póliza vigente, regla de negocio)',
    schema: { example: { status: false, result: { status: false, error: 'Póliza vigente con el mismo asegurado.' } } },
  })
  @ApiCommonErrors()
  async validar(@Body() dto: ValidateEmissionPersonDto) {
    const result = await this.personasService.validateEmissionPerson(
      dto as unknown as Record<string, unknown>,
    );
    return { status: result.status, result };
  }

  // ── POST /api/v1/personas/emision ─────────────────────────────────────────

  @Post('emision')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('apikey')
  @ApiOperation({
    summary: 'Funerario paso 6 · Emitir póliza de personas',
    description: 'Emite la póliza de personas y devuelve número de póliza y recibo.',
    operationId: 'funerarioPersonasEmision',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: CreateEmissionPersonDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, result: { message: 'Emisión registrada exitosamente.', cnpoliza: '9-1-0000001234', cnrecibo: '9-100012345' } } },
  })
  @Api401()
  @ApiCommonErrors()
  async emitir(@Headers('apikey') apikey: string, @Body() dto: CreateEmissionPersonDto) {
    const result = await this.personasService.createEmissionPerson(apikey ?? '', dto);
    return { status: true, result };
  }
}
