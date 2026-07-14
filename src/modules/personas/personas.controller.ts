import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PersonasService } from './personas.service';
import { GetPlanesPerDto } from './dto/get-planes-per.dto';
import { CotizacionPerDto } from './dto/cotizacion-per.dto';
import { CreateEmissionPersonDto } from './dto/create-emission-person.dto';
import { Api401, Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiExcludeController()
@ApiTags('personas')
@Controller('v1/personas')
export class PersonasController {
  constructor(private readonly personasService: PersonasService) {}

  // ── POST /api/v1/personas/planes ──────────────────────────────────────────

  @Post('planes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Planes de personas vigentes (ramo 9 = Funerario)',
    description:
      'Ejecuta `spBuscaPlan` con el ramo indicado (9 por defecto) y enriquece con ' +
      'los parentescos y rangos de edad permitidos (`mapltarifas_per` / `mapledades_per`). ' +
      'Réplica parametrizada del `getPlanesPer` del backend Express.',
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
    summary: 'Cotizar póliza de personas (spCalculoPer)',
    description:
      'Ejecuta `spCalculoPer` por cada asegurado y suma las primas. ' +
      'Devuelve `mprimaext` (USD), `mprima` (Bs) y `ptasa`. ' +
      'Réplica parametrizada del `getCotizacionPer` del backend Express.',
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

  // ── POST /api/v1/personas/emision ─────────────────────────────────────────

  @Post('emision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Emitir póliza de personas (Funerario)',
    description:
      'Inserta en la vista `eePoliza_Personas_General` (trigger INSTEAD OF INSERT). ' +
      'Requiere header `apikey` (se valida contra `maclient_api`). ' +
      'Devuelve `cnpoliza`, `cnrecibo` y `urlpoliza`.',
  })
  @ApiHeader({ name: 'apikey', description: 'Token de autenticación del canal emisor (opcional en QA interno)', required: false })
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
