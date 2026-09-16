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
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { ComponentsService } from './components.service';

function asUser(headers: ReportesHeaders): ReportesRequestUser | null {
  const raw = headers['x-cusuario'] ?? headers['X-CUsuario'];
  if (raw === undefined || raw === null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) ? { cusuario: n } : null;
}

@ApiTags(SWAGGER_TAGS.REPORTES)
@Controller('v1/components')
@NestProtected(NEST_AUTH_SCOPES.REPORT_WRITE)
export class ComponentsController {
  constructor(private readonly service: ComponentsService) {}

  private throwIfError(result: unknown): void {
    if (isReportesError(result)) {
      throw new BadRequestException(result.message);
    }
  }

  @Post(':slug/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar componente/reporte por slug' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiCommonErrors()
  async execute(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.execute(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':slug/filtros')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Filtros del componente por slug' })
  @ApiCommonErrors()
  async getFiltros(
    @Param('slug') slug: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getFiltros(
      slug,
      query || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':slug/configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configuración KPIs/gráficos del componente' })
  @ApiCommonErrors()
  async getConfiguracion(
    @Param('slug') slug: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getConfiguracion(
      slug,
      query || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':slug/configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar configuración del componente' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiCommonErrors()
  async saveConfiguracion(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveConfiguracion(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Get(':slug/vista-configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar vistas de configuración' })
  @ApiCommonErrors()
  async getVistasConfiguracion(
    @Param('slug') slug: string,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getVistasConfiguracion(
      slug,
      query || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':slug/vista-configuracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar vista de configuración' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiCommonErrors()
  async saveVistaConfiguracion(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.saveConfiguracion(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Delete(':slug/vista-configuracion/:cconfiguracion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar vista de configuración' })
  @ApiCommonErrors()
  async deleteVistaConfiguracion(
    @Param('slug') slug: string,
    @Param('cconfiguracion', ParseIntPipe) cconfiguracion: number,
    @Query() query: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.deleteVistaConfiguracion(
      slug,
      cconfiguracion,
      query || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post(':slug/export')
  @SkipEnvelope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exportar componente/reporte por slug' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiCommonErrors()
  async exportData(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
    @Res({ passthrough: false }) res: Response,
  ) {
    const result = await this.service.exportData(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(result);

    if (
      result &&
      typeof result === 'object' &&
      (result as { buffer?: Buffer }).buffer
    ) {
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

    return res.status(HttpStatus.OK).json({ status: true, data: result });
  }

  @Post(':slug/insights')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Insights IA del componente' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiCommonErrors()
  async getInsights(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.getInsights(
      slug,
      body || {},
      asUser(headers),
      headers,
    );
    return { status: true, data };
  }
}
