import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import {
  isReportesError,
  type ReportesHeaders,
  type ReportesRequestUser,
} from '../reportes-shared/reportes-request.util';
import {
  ConfiguracionBodyDto,
  DeleteVistaParamDto,
  ExecuteReportDto,
  ExportDataDto,
  ExportQueryDto,
  InsightsDto,
  ListBodyDto,
  SaveSchemaDto,
  VistaConfiguracionDto,
} from './dto/dynamic-schemas.dto';
import { DynamicSchemasService } from './dynamic-schemas.service';

function asUser(headers: ReportesHeaders): ReportesRequestUser | null {
  const raw = headers['x-cusuario'] ?? headers['X-CUsuario'];
  if (raw === undefined || raw === null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) ? { cusuario: n } : null;
}

@ApiTags(SWAGGER_TAGS.REPORTES)
@Controller('v1/dynamic-schemas')
@NestProtected(NEST_AUTH_SCOPES.REPORT_WRITE)
export class DynamicSchemasController {
  constructor(private readonly service: DynamicSchemasService) {}

  private throwIfError(result: unknown): void {
    if (isReportesError(result)) {
      throw new BadRequestException(result.message);
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar esquemas de reporte activos' })
  @ApiCommonErrors()
  async getReports() {
    const data = await this.service.getReports();
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':nombreInterno/meta')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Meta / esquema de un reporte' })
  @ApiCommonErrors()
  async getSchema(
    @Param('nombreInterno') nombreInterno: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getSchema(
      { nombreInterno },
      query,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post('list/:ccampo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista dinámica por campo' })
  @ApiBody({ type: ListBodyDto })
  @ApiCommonErrors()
  async getList(
    @Param('ccampo', ParseIntPipe) ccampo: number,
    @Body() body: ListBodyDto,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getList(
      { ccampo },
      body as Record<string, unknown>,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post('save/:nombreInterno')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar formulario dinámico' })
  @ApiBody({ type: SaveSchemaDto })
  @ApiCommonErrors()
  async saveSchema(
    @Param('nombreInterno') nombreInterno: string,
    @Body() body: SaveSchemaDto,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveSchema(
      { nombreInterno },
      body as Record<string, unknown>,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':nombreInterno/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar reporte dinámico' })
  @ApiBody({ type: ExecuteReportDto })
  @ApiCommonErrors()
  async executeReport(
    @Param('nombreInterno') nombreInterno: string,
    @Body() body: ExecuteReportDto,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.executeReport(
      { nombreInterno },
      body as Record<string, unknown>,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':nombreInterno/export')
  @SkipEnvelope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exportar reporte dinámico' })
  @ApiBody({ type: ExportDataDto })
  @ApiCommonErrors()
  async exportData(
    @Param('nombreInterno') nombreInterno: string,
    @Body() body: ExportDataDto,
    @Query() query: ExportQueryDto,
    @Headers() headers: ReportesHeaders,
    @Res({ passthrough: false }) res: Response,
  ) {
    const preview =
      query.preview === true || String(query.preview) === 'true';
    const result = await this.service.exportData(
      { nombreInterno },
      body as Record<string, unknown>,
      asUser(headers),
      preview,
      headers,
    );
    this.throwIfError(result);

    if (preview) {
      return res.status(HttpStatus.OK).json({ status: true, data: result });
    }

    const file = result as {
      buffer: Buffer;
      contentType: string;
      filename: string;
      extension: string;
    };
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}.${file.extension}"`,
    );
    return res.status(HttpStatus.OK).send(file.buffer);
  }

  @Post(':nombreInterno/insights')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Insights IA del reporte' })
  @ApiBody({ type: InsightsDto })
  @ApiCommonErrors()
  async getInsights(
    @Param('nombreInterno') nombreInterno: string,
    @Body() body: InsightsDto,
  ) {
    const data = await this.service.getInsights(
      { nombreInterno },
      body as Record<string, unknown>,
    );
    return { status: true, data };
  }

  @Get(':nombreInterno/configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener configuración KPIs/gráficos' })
  @ApiCommonErrors()
  async getConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getConfiguracion(
      { nombreInterno },
      query,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':nombreInterno/configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar configuración KPIs/gráficos' })
  @ApiBody({ type: ConfiguracionBodyDto })
  @ApiCommonErrors()
  async saveConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Body() body: ConfiguracionBodyDto,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveConfiguracion(
      { nombreInterno },
      body as Record<string, unknown>,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':nombreInterno/vista-configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar vistas de configuración del usuario' })
  @ApiCommonErrors()
  async getVistasConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getVistasConfiguracion(
      { nombreInterno },
      query,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':nombreInterno/vista-configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar vista de configuración' })
  @ApiBody({ type: VistaConfiguracionDto })
  @ApiCommonErrors()
  async saveVistaConfiguracion(
    @Param('nombreInterno') nombreInterno: string,
    @Body() body: VistaConfiguracionDto,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveVistaConfiguracion(
      { nombreInterno },
      body as Record<string, unknown>,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Delete(':nombreInterno/vista-configuracion/:cconfiguracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar (soft) vista de configuración' })
  @ApiCommonErrors()
  async deleteVistaConfiguracion(
    @Param() params: DeleteVistaParamDto,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.deleteVistaConfiguracion(
      {
        nombreInterno: params.nombreInterno,
        cconfiguracion: params.cconfiguracion,
      },
      query,
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }
}

@ApiTags(SWAGGER_TAGS.REPORTES)
@Controller('v1/dynamic-schemas/admin')
@NestProtected(NEST_AUTH_SCOPES.REPORT_WRITE)
export class DynamicSchemasAdminController {
  constructor(private readonly service: DynamicSchemasService) {}

  private throwIfError(result: unknown): void {
    if (isReportesError(result)) {
      throw new BadRequestException(result.message);
    }
  }

  @Get('list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: listar esquemas' })
  @ApiCommonErrors()
  async listarEsquemas(@Headers() headers: ReportesHeaders) {
    const data = await this.service.listarEsquemas(asUser(headers) || {});
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get('fields/:cesquema')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: listar campos de esquema' })
  @ApiCommonErrors()
  async obtenerCampos(
    @Param('cesquema', ParseIntPipe) cesquema: number,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.obtenerCampos(
      { cesquema },
      asUser(headers) || {},
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post('fields')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: insertar campo' })
  @ApiCommonErrors()
  async insertarCampo(
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.guardarCampo(
      { ccampo: null },
      body,
      asUser(headers) || {},
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Put('fields/:ccampo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: actualizar campo' })
  @ApiCommonErrors()
  async actualizarCampo(
    @Param('ccampo', ParseIntPipe) ccampo: number,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.guardarCampo(
      { ccampo },
      body,
      asUser(headers) || {},
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post('metadata')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: guardar metadata de esquema' })
  @ApiCommonErrors()
  async guardarMetadata(
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.guardarMetadata(
      body,
      asUser(headers) || {},
    );
    this.throwIfError(data);
    return { status: true, data };
  }
}
