import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { RegistrarSiniestroDto } from './dto/registrar-siniestro.dto';
import { SiniestrosRegistroService } from './siniestros-registro.service';

@ApiTags('7. Consulta de clientes')
@Controller('v1/client/siniestros')
@NestProtected(NEST_AUTH_SCOPES.SINIESTROS_WRITE)
export class SiniestrosRegistroController {
  constructor(private readonly registro: SiniestrosRegistroService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Registrar un siniestro de Automóvil en SIS2000',
    description:
      'Crea el siniestro en `snsinies` (`sp_registra_siniestro_nexus`). La póliza debe estar en curso y la ocurrencia dentro de su ' +
      'vigencia; se acepta con recibos pendientes (el cobro se exige al pagar). **Idempotente**: repetir la misma póliza + placa + ' +
      'fecha de ocurrencia + causa devuelve el siniestro existente (`yaExistia: true`). El monto va en la moneda de la póliza. ' +
      '**Seguridad**: requiere API Key con scope `siniestros:write`.',
  })
  @ApiBody({ type: RegistrarSiniestroDto })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, result: { csinies: '1800000000002301', cnsinies: '18-00000002288', yaExistia: false, mensaje: 'Siniestro registrado exitosamente.' } } },
  })
  @ApiResponse({ status: 400, description: 'SIS2000 rechazó el alta (póliza fuera de vigencia, causa inexistente, fechas inválidas...)' })
  @ApiCommonErrors()
  async registrar(@Body() dto: RegistrarSiniestroDto) {
    const result = await this.registro.registrar(dto);
    return { status: true, result };
  }
}
