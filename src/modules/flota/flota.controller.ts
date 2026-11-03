import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { FlotaService } from './flota.service';
import {
  CrearPolizaFlotaDto, ExcluirCertificadoDto, IncluirCertificadoDto, ReciboCertificadoDto,
} from './dto/flota.dto';

const NOTA_SP =
  'Usa el SP de Sis2000 indicado (creado por La Mundial en Sis2000_QA el 3-nov-2026). ' +
  'Si la base conectada no lo tiene responde 501.';

/**
 * Póliza de flota con cobro por viaje (Ridery): la póliza colectiva y sus certificados (vehículo + conductor)
 * se emiten SIN recibo; cada viaje pagado genera un recibo sobre el certificado del conductor.
 */
@ApiTags(SWAGGER_TAGS.FLOTA)
@Controller('flota')
@NestProtected(NEST_AUTH_SCOPES.FLOTA_WRITE)
export class FlotaController {
  constructor(private readonly svc: FlotaService) {}

  @Get('polizas/:cnpoliza')
  @ApiOperation({ summary: 'Póliza de flota y sus certificados (vhcerti) con conductor y cantidad de recibos' })
  @ApiParam({ name: 'cnpoliza', example: '18-1-1130480881' })
  getPoliza(@Param('cnpoliza') cnpoliza: string) {
    return this.svc.getPolizaFlota(cnpoliza);
  }

  @Get('polizas/:cnpoliza/certificados/:ccerti/recibos')
  @ApiOperation({ summary: 'Recibos de un certificado de la póliza de flota' })
  getRecibos(@Param('cnpoliza') cnpoliza: string, @Param('ccerti', ParseIntPipe) ccerti: number) {
    return this.svc.getRecibosCertificado(cnpoliza, ccerti);
  }

  @Post('polizas')
  @ApiOperation({
    summary: 'Crear la póliza de flota (cabecera colectiva) sin recibos por certificado',
    description: `SP: sp_flota_crear_poliza_nexus. ${NOTA_SP}`,
  })
  @ApiBody({ type: CrearPolizaFlotaDto })
  @ApiResponse({ status: 201, schema: { example: { status: true, message: '', cnpoliza: '18-1-1130499999', cpoliza: 1800000000001234 } } })
  @ApiResponse({ status: 501, description: 'El SP aún no existe en Sis2000.' })
  crearPoliza(@Body() dto: CrearPolizaFlotaDto) {
    return this.svc.crearPoliza(dto);
  }

  @Post('polizas/:cnpoliza/certificados')
  @ApiOperation({
    summary: 'Incluir un vehículo con su conductor como certificado, sin recibo',
    description: `SP: sp_flota_incluir_certificado_nexus (@generarRecibo = 0). ${NOTA_SP}`,
  })
  @ApiBody({ type: IncluirCertificadoDto })
  @ApiResponse({ status: 201, schema: { example: { status: true, message: '', cnpoliza: '18-1-1130480881', ccerti: 3 } } })
  @ApiResponse({ status: 501, description: 'El SP aún no existe en Sis2000.' })
  incluir(@Param('cnpoliza') cnpoliza: string, @Body() dto: IncluirCertificadoDto) {
    return this.svc.incluirCertificado(cnpoliza, dto);
  }

  @Post('polizas/:cnpoliza/certificados/:ccerti/excluir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Excluir un certificado (vehículo/conductor) de la flota',
    description: `SP: sp_flota_excluir_certificado_nexus. ${NOTA_SP}`,
  })
  @ApiBody({ type: ExcluirCertificadoDto })
  excluir(
    @Param('cnpoliza') cnpoliza: string,
    @Param('ccerti', ParseIntPipe) ccerti: number,
    @Body() dto: ExcluirCertificadoDto,
  ) {
    return this.svc.excluirCertificado(cnpoliza, ccerti, dto);
  }

  @Post('polizas/:cnpoliza/certificados/:ccerti/recibos')
  @ApiOperation({
    summary: 'Recibo de un viaje sobre el certificado del conductor (idempotente por creferencia)',
    description:
      'No anula ni recorta otros recibos y no cambia el plan ni la frecuencia de la póliza ' +
      `(a diferencia de POST /api/endosos/recibos). SP: sp_crear_recibo_certificado_nexus. ${NOTA_SP}`,
  })
  @ApiBody({ type: ReciboCertificadoDto })
  @ApiResponse({
    status: 201,
    schema: { example: { status: true, message: '', cnpoliza: '18-1-1130480881', ccerti: 3, cnrecibo: '18-998877', crecibo: 998877, yaExistia: false } },
  })
  @ApiResponse({ status: 501, description: 'El SP aún no existe en Sis2000.' })
  crearRecibo(
    @Param('cnpoliza') cnpoliza: string,
    @Param('ccerti', ParseIntPipe) ccerti: number,
    @Body() dto: ReciboCertificadoDto,
  ) {
    return this.svc.crearReciboCertificado(cnpoliza, ccerti, dto);
  }
}
