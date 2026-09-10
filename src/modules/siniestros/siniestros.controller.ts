import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
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
import { SiniestrosService } from './siniestros.service';

function asUser(headers: ReportesHeaders): ReportesRequestUser | null {
  const raw = headers['x-cusuario'] ?? headers['X-CUsuario'];
  if (raw === undefined || raw === null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) ? { cusuario: n } : null;
}

@ApiTags(SWAGGER_TAGS.REPORTES)
@Controller('v1/siniestros')
@NestProtected(NEST_AUTH_SCOPES.REPORT_WRITE)
export class SiniestrosController {
  constructor(private readonly service: SiniestrosService) {}

  private throwIfError(result: unknown): void {
    if (isReportesError(result)) {
      throw new BadRequestException(result.message);
    }
  }

  @Get('filtros')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Catálogos de filtros de siniestros' })
  @ApiCommonErrors()
  async getFiltros(@Headers() headers: ReportesHeaders) {
    const data = await this.service.getFiltros(asUser(headers), headers);
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar reporte de siniestros' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiCommonErrors()
  async execute(
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
  ) {
    const data = await this.service.execute(body || {}, asUser(headers), headers);
    this.throwIfError(data);
    return { status: true, data };
  }

  @Post('export')
  @SkipEnvelope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exportar reporte de siniestros' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiCommonErrors()
  async exportData(
    @Body() body: Record<string, unknown>,
    @Headers() headers: ReportesHeaders,
    @Res({ passthrough: false }) res: Response,
  ) {
    const result = await this.service.exportData(
      body || {},
      asUser(headers),
      headers,
    );
    this.throwIfError(result);

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
}
