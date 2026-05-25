import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPlanesV2Dto } from './dto/get-planes-v2.dto';
import { GetCitiesDto } from './dto/get-cities.dto';
import { GetCotizacionAutoDto } from './dto/get-cotizacion-auto.dto';
import { ValrepService } from './valrep.service';
import { Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiTags('valrep')
@Controller('v1/valrep')
export class ValrepController {
  constructor(private readonly valrepService: ValrepService) {}

  // ── GET /api/v1/valrep/matipos ─────────────────────────────────────────

  @Get('matipos')
  @ApiOperation({ summary: 'Lista de tipos de vehículos', description: 'Consulta la tabla `matipos`. Necesario para filtrar marcas por tipo.' })
  @ApiResponse({ status: 200, schema: { example: { status: true, data: [{ ctipo: 1, xtipo: 'PARTICULARES' }, { ctipo: 2, xtipo: 'RUSTICOS' }] } } })
  @Api500()
  async getMatipos() {
    const data = await this.valrepService.getMatipos();
    return { status: true, data };
  }

  // ── POST /api/v1/valrep/macategtr ──────────────────────────────────────

  @Post('macategtr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Categorías de uso por tipo de vehículo', description: 'Filtra `macategtr` por `ctipo`. El `ctipo` viene de `/inma/version`.' })
  @ApiBody({ schema: { example: { ctipo: 3 }, description: 'Tipo de vehículo numérico (ver /valrep/matipos)' } })
  @ApiResponse({ status: 200, schema: { example: { status: true, data: { categoria: [{ ccategotr: '7', xcategoria: 'Hasta 2 TM. de Cap.' }] } } } })
  @ApiCommonErrors()
  async getMacategtr(@Body() body: { ctipo?: string | number; categoria?: string | number }) {
    const ctipo = body.ctipo ?? body.categoria;
    const categoria = await this.valrepService.getMacategtr(ctipo ?? '');
    return { status: true, data: { categoria } };
  }

  // ── GET /api/v1/valrep/states ───────────────────────────────────────────

  @Get('states')
  @ApiOperation({ summary: 'Lista de estados de Venezuela', description: 'Consulta `maestados` en Sis2000. Reemplaza el proxy a La Mundial.' })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, data: { states: [{ cestado: 1, xdescripcion_l: 'Distrito Capital' }, { cestado: 2, xdescripcion_l: 'Amazonas' }] } } },
  })
  @Api500()
  async getStates() {
    const states = await this.valrepService.getStates();
    return { status: true, data: { states } };
  }

  // ── GET /api/v1/valrep/cities ───────────────────────────────────────────

  @Get('cities')
  @ApiOperation({ summary: 'Lista de ciudades de Venezuela', description: 'Consulta `maciudades`. Si se pasa `cestado` filtra por estado.' })
  @ApiQuery({ name: 'cestado', required: false, type: Number, example: 1, description: 'Código de estado (de /states). Omitir para todas.' })
  @ApiResponse({ status: 200, schema: { example: { status: true, data: { cities: [{ cciudad: 128, xdescripcion_l: 'Caracas' }] } } } })
  @ApiCommonErrors()
  async getCities(@Query() dto: GetCitiesDto) {
    const cities = await this.valrepService.getCities(dto.cestado);
    return { status: true, data: { cities } };
  }

  // ── POST /api/v1/valrep/getLists ───────────────────────────────────────

  @Post('getLists')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lista de catálogo genérico',
    description:
      'Replica el endpoint `POST /api/v1/valrep/getLists` de La Mundial. ' +
      'PARENTESCOS se lee de `maparent` en Sis2000. ' +
      'SEXO, EDOCIVIL, FRECUENCIAS y MATIPCANAL son valores fijos del dominio de seguros.',
  })
  @ApiBody({
    schema: {
      example: { cdominio: 'SEXO', xtipo_orden: 'ASC' },
      properties: {
        cdominio:    { type: 'string', enum: ['SEXO', 'EDOCIVIL', 'PARENTESCOS', 'FRECUENCIAS', 'MATIPCANAL'] },
        xtipo_orden: { type: 'string', enum: ['ASC', 'DESC'], description: 'Ignorado (siempre ASC)' },
      },
      required: ['cdominio'],
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          listas: [
            { cvalor: 'M', xdescripcion: 'Masculino' },
            { cvalor: 'F', xdescripcion: 'Femenino' },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Dominio no permitido' })
  @Api500()
  async getLists(@Body() body: { cdominio?: string; xtipo_orden?: string }) {
    const listas = await this.valrepService.getLists(body.cdominio ?? '');
    return { status: true, data: { listas } };
  }

  // ── POST /api/v1/valrep/planes/v2 ──────────────────────────────────────

  @Post('planes/v2')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Planes disponibles (v2)',
    description:
      'Ejecuta `spBuscaPlan` y enriquece con parentescos y coberturas. ' +
      'Réplica del Express original con todos los bugs corregidos (queries parametrizadas, catch vacíos eliminados).',
  })
  @ApiBody({ type: GetPlanesV2Dto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          plan: [{
            cramo: 18, cplan: 'RCVBAS', xplan: 'Plan 5.000$ (RCV)',
            parentescos: [{ cparen: 'T', xparentesco: 'TITULAR', min_edad: 18, max_edad: 75 }],
            coberturas:  [{ ccobertura: '17', xcobertura: 'RESPONSABILIDAD CIVIL' }],
          }],
        },
      },
    },
  })
  @ApiCommonErrors()
  async getPlanesV2(@Body() dto: GetPlanesV2Dto) {
    const plan = await this.valrepService.getPlanesV2(dto);
    return { status: true, data: { plan } };
  }

  // ── POST /api/v1/valrep/cotizacion ─────────────────────────────────────

  @Post('cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar prima RCV (spCalculoAuto)',
    description:
      'Llama a `spCalculoAuto` en Sis2000 con el código de plan real ' +
      '(RCVBAS, RUSPAT, Auto, AutoI…). ' +
      'Devuelve `mprimaext` (USD), `mprima` (Bs) y `ptasa` (tasa BCV). ' +
      'A diferencia de La Mundial externa, soporta todos los planes.',
  })
  @ApiBody({ type: GetCotizacionAutoDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, data: { mprimaext: 119.65, mprima: 60853.02, ptasa: 508.6004 } } },
  })
  @ApiResponse({ status: 400, description: 'cplan inválido, datos del vehículo incorrectos o prima = 0.' })
  @Api500()
  async getCotizacionAuto(@Body() dto: GetCotizacionAutoDto) {
    const data = await this.valrepService.getCotizacionAuto(dto);
    return { status: true, data };
  }
}
