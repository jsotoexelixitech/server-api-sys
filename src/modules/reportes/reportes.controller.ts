import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { PolizasQueryDto } from './dto/polizas-query.dto';
import { RunSyncDto } from './dto/run-sync.dto';
import { ReportesService } from './reportes.service';

function isBadRequestError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /requerid|requerida|no soportada|no hay aseguradoras/i.test(message);
}

@ApiTags(SWAGGER_TAGS.REPORTES)
@Controller('v1/reportes')
@NestProtected(NEST_AUTH_SCOPES.REPORT_WRITE)
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  private rethrow(error: unknown): never {
    if (error instanceof BadRequestException) throw error;
    if (isBadRequestError(error)) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error),
      );
    }
    throw error;
  }

  @Get('aseguradoras')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar aseguradoras activas (conexiones origen)' })
  @ApiCommonErrors()
  async listAseguradoras() {
    try {
      const data = await this.reportesService.listAseguradoras();
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Get('polizas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reporte de pólizas (sync + consulta PG destino)' })
  @ApiCommonErrors()
  async getReportePolizas(@Query() query: PolizasQueryDto) {
    try {
      const data = await this.reportesService.getReportePolizas(query);
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Get('sync/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estado de sync de todas las aseguradoras activas' })
  @ApiCommonErrors()
  async getSyncStatusAll() {
    try {
      const data = await this.reportesService.getSyncStatusAll();
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Get('sync/status/:aseguradoraId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estado de sync de una aseguradora' })
  @ApiCommonErrors()
  async getSyncStatus(
    @Param('aseguradoraId', ParseIntPipe) aseguradoraId: number,
  ) {
    try {
      const data = await this.reportesService.getSyncStatus(aseguradoraId);
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar sync incremental de una entidad' })
  @ApiBody({ type: RunSyncDto })
  @ApiCommonErrors()
  async runSync(
    @Body() body: RunSyncDto,
    @Headers() headers: Record<string, unknown>,
  ) {
    try {
      const data = await this.reportesService.runSync(body || {}, headers);
      return { status: true, data };
    } catch (error) {
      this.rethrow(error);
    }
  }
}
