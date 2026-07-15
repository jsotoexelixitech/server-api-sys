import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBody, ApiExcludeEndpoint, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPlanesV2Dto } from './dto/get-planes-v2.dto';
import { GetCitiesDto } from './dto/get-cities.dto';
import { GetCotizacionAutoDto } from './dto/get-cotizacion-auto.dto';
import { GetFrecuenciaDto } from './dto/get-frecuencia.dto';
import { GetProductosPersonasDto } from './dto/get-productos-personas.dto';
import { GetPlanesProductoDto } from './dto/get-planes-producto.dto';
import { GetPlanesDetallePersonasDto } from './dto/get-planes-detalle-personas.dto';
import { ValrepService } from './valrep.service';
import { Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { RCV_COTIZACION_EXAMPLE } from '../../common/swagger/api-docs.constants';

import { PersonasService } from '../personas/personas.service';
import { GetPlanesPerDto } from '../personas/dto/get-planes-per.dto';

@ApiTags('2. Catálogos y cotización (valrep)')
@Controller('v1/valrep')
export class ValrepController {
  constructor(
    private readonly valrepService: ValrepService,
    private readonly personasService: PersonasService,
  ) {}

  // ── GET /api/v1/valrep/matipos ─────────────────────────────────────────

  @Get('matipos')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Lista de tipos de vehículos', description: 'Consulta la tabla `matipos`. Necesario para filtrar marcas por tipo.' })
  @ApiResponse({ status: 200, schema: { example: { status: true, data: [{ ctipo: 1, xtipo: 'PARTICULARES' }, { ctipo: 2, xtipo: 'RUSTICOS' }] } } })
  @Api500()
  async getMatipos() {
    const data = await this.valrepService.getMatipos();
    return { status: true, data };
  }

  // ── POST /api/v1/valrep/planesPer ──────────────────────────────────────

  @Post('planesPer')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Planes de personas vigentes (ramo 9 = Funerario)',
    description: 'Devuelve los planes de personas con formato plan en lugar de planes.',
  })
  @ApiBody({ type: GetPlanesPerDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: { plan: [{ cplan: 'FUNBAS', xplan: 'Plan Funerario Básico', cramo: 9, cmoneda: 'USD', parentescos: [{ cparen: 1, xparentesco: 'TITULAR', min_edad: 18, max_edad: 75 }] }] },
      },
    },
  })
  @Api500()
  async getPlanesPer(@Body() dto: GetPlanesPerDto) {
    const plan = await this.personasService.getPlanesPer(dto.cramo, dto.ctipo ?? null);
    return { status: true, data: { plan } };
  }

  // ── POST /api/v1/valrep/macategtr ──────────────────────────────────────

  @Post('macategtr')
  @ApiExcludeEndpoint()
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
  @ApiOperation({
    summary: 'Paso 2a · Estados de Venezuela',
    description: 'Consulta `maestados` (cpais=58). Usar `cestado` en `/cities`.',
    operationId: 'valrepStates',
  })
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
  @ApiOperation({
    summary: 'Paso 2b · Ciudades por estado',
    description: 'Consulta `maciudades`. Omitir `cestado` para listar todas.',
    operationId: 'valrepCities',
  })
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
    summary: 'Paso 2c · Listas de catálogo (sexo, parentescos, etc.)',
    description: 'Dominios: `SEXO`, `EDOCIVIL`, `PARENTESCOS`, `FRECUENCIAS`, `MATIPCANAL`. Parentescos desde `maparent`.',
    operationId: 'valrepGetLists',
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

  // ── Funerario: pasos 1–3 (catálogo valrep, fb_organizacion_swagger) ───────

  @Post('productos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Funerario paso 1 · Productos de personas',
    description:
      'Réplica de SysIP `Valrep.getProducts` (ruta real en fb_organizacion_swagger).\n\n' +
      'Requiere `citem` + `centidad` (P=productor, C=canal). El swagger de La Mundial documenta ' +
      '`spBuscaProductosEntidad`, pero la ruta `/valrep/productos` está cableada a `getProducts`.\n\n' +
      '**Siguiente paso:** `POST /valrep/planes/producto` con el `cproducto` elegido.',
    operationId: 'funerarioValrepProductos',
  })
  @ApiBody({ type: GetProductosPersonasDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: [
          { cproducto: '57', xproducto: 'FUNERARIO INDIVIDUAL', cramo: 9 },
        ],
      },
    },
  })
  @ApiCommonErrors()
  async getProductosPersonas(@Body() dto: GetProductosPersonasDto) {
    const productos = await this.valrepService.getProductosPersonas(dto);
    return { status: true, data: productos };
  }

  @Post('planes/producto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Funerario paso 2 · Planes por producto',
    description:
      'Ejecuta `spBuscaPlanProducto` y enriquece con parentescos/edades.\n\n' +
      '**Siguiente paso:** `POST /valrep/planes/detalle` con `cramo` y `cplan`.',
    operationId: 'funerarioValrepPlanesProducto',
  })
  @ApiBody({ type: GetPlanesProductoDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          plan: [{ cramo: 9, cplan: '4', xplan: 'Plan Funerario Básico', parentescos: [] }],
          mensaje: '',
        },
      },
    },
  })
  @ApiCommonErrors()
  async getPlanesProducto(@Body() dto: GetPlanesProductoDto) {
    const { planes, mensaje } = await this.valrepService.getPlanesProducto(dto);
    return { status: true, data: { plan: planes, mensaje } };
  }

  @Post('planes/detalle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Funerario paso 3 · Detalle del plan',
    description:
      'Ejecuta `spBuscaDetallePlan` (detalle operativo, parentescos y coberturas).\n\n' +
      '**Siguiente paso:** `POST /external/getCotizacionPer` o `POST /personas/cotizacion`.',
    operationId: 'funerarioValrepPlanesDetalle',
  })
  @ApiBody({ type: GetPlanesDetallePersonasDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          plan: [{
            cramo: 9,
            cplan: '4',
            xplan: 'Plan Funerario Básico',
            parentescos: [{ cparen: 1, xparentesco: 'TITULAR', min_edad: 18, max_edad: 75 }],
            coberturas: [{ ccobertura: '01', xcobertura: 'SERVICIO FUNERARIO' }],
          }],
        },
      },
    },
  })
  @ApiCommonErrors()
  async getPlanesDetallePersonas(@Body() dto: GetPlanesDetallePersonasDto) {
    const plan = await this.valrepService.getPlanesDetallePersonas(dto);
    return { status: true, data: { plan } };
  }

  // ── POST /api/v1/valrep/planes/v2 ──────────────────────────────────────

  @Post('planes/v2')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 3 · Planes RCV disponibles',
    description:
      'Ejecuta `spBuscaPlan` + parentescos y coberturas. ' +
      'El `cplan` devuelto se usa en `POST /valrep/frecuencia` y luego en `POST /valrep/cotizacion`.',
    operationId: 'valrepPlanesV2',
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

  // ── POST /api/v1/valrep/frecuencia ─────────────────────────────────────

  @Post('frecuencia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 3b · Frecuencias del plan',
    description:
      'Consulta `maplanes_frec` y devuelve las frecuencias de pago válidas para el `cplan` elegido en `planes/v2`.\n\n' +
      '**Siguiente paso:** `POST /valrep/cotizacion` (usar `cvalor` como frecuencia en emisión).',
    operationId: 'valrepFrecuencia',
  })
  @ApiBody({ type: GetFrecuenciaDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          frecuencias: [
            { cvalor: 'A', xdescripcion: 'ANUAL' },
            { cvalor: 'S', xdescripcion: 'SEMESTRAL' },
            { cvalor: 'M', xdescripcion: 'MENSUAL' },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'cplan requerido o inválido' })
  @Api500()
  async getFrecuencia(@Body() body: GetFrecuenciaDto) {
    const frecuencias = await this.valrepService.getFrecuencia(body.cplan);
    return { status: true, data: { frecuencias } };
  }

  // ── POST /api/v1/valrep/cotizacion ─────────────────────────────────────

  @Post('cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 4 · Cotizar prima RCV',
    description:
      'Ejecuta `spCalculoAuto`. Requiere `cplan` de `planes/v2`, frecuencia de `frecuencia` y datos del vehículo (marca, modelo, año, suma asegurada).\n\n' +
      '**Siguiente paso:** `POST /external/validateEmissionAuto`',
    operationId: 'valrepCotizacionAuto',
  })
  @ApiBody({ type: GetCotizacionAutoDto })
  @ApiResponse({
    status: 200,
    description: 'Prima calculada (Bs y USD).',
    schema: { example: { status: true, data: RCV_COTIZACION_EXAMPLE } },
  })
  @ApiResponse({ status: 400, description: 'cplan inválido, datos del vehículo incorrectos o prima = 0.' })
  @Api500()
  async getCotizacionAuto(@Body() dto: GetCotizacionAutoDto) {
    const data = await this.valrepService.getCotizacionAuto(dto);
    return { status: true, data };
  }
}
