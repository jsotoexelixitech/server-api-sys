import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import {
  isReportesError,
  type ReportesHeaders,
  type ReportesRequestUser,
} from '../reportes-shared/reportes-request.util';
import { PolizasService } from './polizas.service';

function asUser(headers: ReportesHeaders): ReportesRequestUser | null {
  const raw = headers['x-cusuario'] ?? headers['X-CUsuario'];
  if (raw === undefined || raw === null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) ? { cusuario: n } : null;
}

@ApiTags(SWAGGER_TAGS.REPORTES)
@Controller('v1/polizas')
@NestProtected(NEST_AUTH_SCOPES.REPORT_WRITE)
export class PolizasController {
  constructor(private readonly service: PolizasService) {}

  private throwIfError(result: unknown): void {
    if (isReportesError(result)) {
      throw new BadRequestException(result.message);
    }
  }

  @Get('filtros')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Catálogos de filtros de pólizas' })
  @ApiCommonErrors()
  async getFiltros(@Headers() headers: ReportesHeaders) {
    const data = await this.service.getFiltros(asUser(headers), headers);
    this.throwIfError(data);
    return { status: true, data };
  }
}
