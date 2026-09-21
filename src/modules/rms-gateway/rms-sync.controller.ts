import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiCrudErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import {
  RmsSyncAplicarDto,
  RmsSyncDrenarDto,
  RmsSyncDesdeRmsDto,
} from './dto/rms-sync.dto';
import { RmsSyncService } from './rms-sync.service';

@ApiTags(SWAGGER_TAGS.ENDOSOS)
@Controller('rms-sync')
export class RmsSyncController {
  constructor(private readonly sync: RmsSyncService) {}

  @Get('personas')
  @ApiOperation({
    summary: 'Informe Sis2000 ↔ RMS (personas de la póliza)',
    description:
      'Compara tomador, titular/asegurado y beneficiario. No escribe. ' +
      'Usa sp_valida_sync_persona_rms_nexus si está publicado.',
  })
  @ApiQuery({ name: 'cnpoliza', example: '7-1-1000002371' })
  @ApiQuery({ name: 'fanopol', required: false, example: 2026 })
  @ApiQuery({ name: 'fmespol', required: false, example: 9 })
  @ApiCrudErrors()
  async informar(
    @Query('cnpoliza') cnpoliza: string,
    @Query('fanopol') fanopol?: string,
    @Query('fmespol') fmespol?: string,
  ) {
    const data = await this.sync.informar(
      String(cnpoliza || '').trim(),
      fanopol ? Number(fanopol) : undefined,
      fmespol ? Number(fmespol) : undefined,
    );
    return { status: true, data };
  }

  @Post('personas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar y opcionalmente aplicar sync de personas',
    description:
      'Sin aplicar: mismo informe que GET. Con aplicar=true: outbox + Sis2000 y/o webhook RMS según el diff.',
  })
  @ApiBody({ type: RmsSyncAplicarDto })
  @ApiCrudErrors()
  async aplicar(@Body() dto: RmsSyncAplicarDto) {
    if (!dto.aplicar) {
      const data = await this.sync.informar(dto.cnpoliza, dto.fanopol, dto.fmespol);
      return { status: true, data };
    }
    return this.sync.aplicar(dto.cnpoliza, dto.fanopol, dto.fmespol);
  }

  @Post('personas/rms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'RMS cambió una persona → Sis2000',
    description:
      'Encola RMS_TO_SIS y ejecuta sp_cambio_datos_poliza_endoso_nexus. Si Sis2000 no responde, queda PENDIENTE.',
  })
  @ApiBody({ type: RmsSyncDesdeRmsDto })
  @ApiCrudErrors()
  async desdeRms(@Body() dto: RmsSyncDesdeRmsDto) {
    const data = await this.sync.desdeRms(dto);
    return { status: true, data };
  }

  @Get('eventos')
  @ApiOperation({
    summary: 'Pendientes del trigger Sis2000 (sync_poliza_evento_rms_nexus)',
    description: 'No escribe. Devuelve la BD a la que está conectado nest-api.',
  })
  @ApiCrudErrors()
  async eventos() {
    const data = await this.sync.listarEventos();
    return { status: true, data };
  }

  @Post('drenar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Drenar eventos del trigger y outbox PENDIENTE hacia RMS',
    description:
      'Lee sync_poliza_evento_rms_nexus (trigger) y sync_persona_rms_nexus. Sin cron.',
  })
  @ApiBody({ type: RmsSyncDrenarDto })
  @ApiCrudErrors()
  async drenar(@Body() dto: RmsSyncDrenarDto) {
    return this.sync.drenar(dto.limit);
  }
}
