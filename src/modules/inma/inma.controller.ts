import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiExcludeEndpoint, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InmaService } from './inma.service';
import { GetMarcasDto } from './dto/get-marcas.dto';
import { GetModeloDto } from './dto/get-modelo.dto';
import { GetVersionDto } from './dto/get-version.dto';
import { GetCategoriasUsoDto } from './dto/get-categorias-uso.dto';
import { Api404, Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiTags('1. Catálogo vehículo (inma)')
@Controller('v1/inma')
export class InmaController {
  constructor(private readonly inmaService: InmaService) {}

  // ── GET /api/v1/inma/anios ────────────────────────────────────────────────

  @Get('anios')
  @ApiOperation({
    summary: 'Paso 1a · Rango de años',
    description: 'Primer paso del catálogo vehículo. Año min/max en `VInma`.',
    operationId: 'inmaAnios',
  })
  @ApiResponse({ status: 200, schema: { example: { status: true, data: { min: 1950, max: 2028 } } } })
  @Api500()
  async getAnios() {
    const data = await this.inmaService.getAnios();
    return { status: true, data };
  }

  // ── POST /api/v1/inma/marcas ──────────────────────────────────────────────

  @Post('marcas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 1b · Marcas por año',
    description: 'Tras elegir año en `anios`. **Siguiente:** `POST /inma/modelo`.',
    operationId: 'inmaMarcas',
  })
  @ApiBody({ type: GetMarcasDto })
  @ApiResponse({ status: 200, schema: { example: { status: true, data: { marcas: [{ cmarca: '074', xmarca: 'TOYOTA' }] } } } })
  @ApiCommonErrors()
  async getMarcas(@Body() dto: GetMarcasDto) {
    const marcas = await this.inmaService.getMarcas(dto);
    return { status: true, data: { marcas } };
  }

  // ── POST /api/v1/inma/marca/:ctipo ────────────────────────────────────────

  @Post('marca/:ctipo')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcas disponibles filtradas por tipo de vehículo', description: '`ctipo`: 1=Particular, 2=Rústico, 3=Carga, 4=Moto, 5=Remolque, 6=Autobús, 8=Minibús, 9=Pick-up' })
  @ApiParam({ name: 'ctipo', type: Number, description: 'Tipo de vehículo (ver /valrep/matipos)', example: 1 })
  @ApiBody({ type: GetMarcasDto })
  @ApiResponse({ status: 200, schema: { example: { status: true, data: { marcas: [{ cmarca: '074', xmarca: 'TOYOTA' }] } } } })
  @ApiCommonErrors()
  async getMarcasByTipo(@Body() dto: GetMarcasDto, @Param('ctipo') ctipo: string) {
    const marcas = await this.inmaService.getMarcas(dto, ctipo);
    return { status: true, data: { marcas } };
  }

  // ── POST /api/v1/inma/modelo ──────────────────────────────────────────────

  @Post('modelo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 1c · Modelos por año y marca',
    description: '**Siguiente:** `POST /inma/version`.',
    operationId: 'inmaModelo',
  })
  @ApiBody({ type: GetModeloDto })
  @ApiResponse({ status: 200, schema: { example: { status: true, data: { info: [{ cmodelo: '001', cmarca: '083', xmodelo: 'LOWBOY' }] } } } })
  @ApiCommonErrors()
  async getModelo(@Body() dto: GetModeloDto) {
    const info = await this.inmaService.getModelo(dto);
    return { status: true, data: { info } };
  }

  // ── POST /api/v1/inma/version ─────────────────────────────────────────────

  @Post('version')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 1d · Versiones (incluye ctipo y suma asegurada)',
    description:
      'Devuelve `ctipo`, `mvalor` (suma asegurada), `ccategotr`. ' +
      'Datos necesarios para `valrep/cotizacion` y emisión.',
    operationId: 'inmaVersion',
  })
  @ApiBody({ type: GetVersionDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          info: [{
            cversion: '03', xversion: '60 Toneladas - N/A', cmarca: '083', cmodelo: '001',
            mvalor: 19761, ctipo: 5, npasajero: 0, ccategotr: null, xclasificacion: 'Q',
          }],
        },
      },
    },
  })
  @ApiCommonErrors()
  async getVersion(@Body() dto: GetVersionDto) {
    const info = await this.inmaService.getVersion(dto);
    return { status: true, data: { info } };
  }

  // ── POST /api/v1/inma/categorias-uso ─────────────────────────────────────

  @Post('categorias-uso')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paso 1e · Categorías de uso del vehículo',
    description: 'Obtiene `ctipo` desde `VInma` y categorías en `macategtr`. Usado en cotización y emisión.',
    operationId: 'inmaCategoriasUso',
  })
  @ApiBody({ type: GetCategoriasUsoDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: { categorias_uso: [{ ccategoria_uso: 11, xcategoria_uso: 'Más de 12 TM. de capacidad' }] },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'El vehículo (marca/modelo/versión/año) no se encontró en VInma.' })
  @ApiCommonErrors()
  @Api404()
  async getCategoriasUso(@Body() dto: GetCategoriasUsoDto) {
    const categorias_uso = await this.inmaService.getCategoriasUso(dto);
    return { status: true, data: { categorias_uso } };
  }
}
