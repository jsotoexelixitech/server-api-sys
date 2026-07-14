import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiExcludeController()
@ApiTags('client')
@Controller('v1/client')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  // ── GET /api/v1/client/search/policies/:cci_rif ──────────────────────────
  // IMPORTANTE: esta ruta debe ir ANTES de /search/:cci_rif para evitar
  // que NestJS interprete "policies" como el parámetro cci_rif.

  @Get('search/policies/:cci_rif')
  @ApiOperation({
    summary: 'Pólizas del asegurado',
    description: 'Ejecuta `spGetPolizasAsegurado`. Devuelve las pólizas vigentes e históricas asociadas a la cédula/RIF.',
  })
  @ApiParam({ name: 'cci_rif', type: String, example: '12345678', description: 'Cédula o RIF numérico del asegurado' })
  @ApiResponse({ status: 200, schema: { example: { status: true, result: { polizas: [{ cnpoliza: '18-1-0000011500', cramo: 18, cplan: 'RCVBAS' }] } } } })
  @ApiResponse({ status: 400, description: 'cci_rif no es numérico' })
  @ApiCommonErrors()
  async searchPolicies(@Param('cci_rif') cci_rif: string) {
    if (!/^\d+$/.test(cci_rif)) {
      throw new BadRequestException('cci_rif debe ser numérico.');
    }
    const polizas = await this.clientService.searchPoliciesByClient(cci_rif);
    return { status: true, result: { polizas } };
  }

  // ── GET /api/v1/client/search/:cci_rif ───────────────────────────────────

  @Get('search/:cci_rif')
  @ApiOperation({
    summary: 'Datos completos del cliente',
    description: 'Consulta `maclient`, `maclient_tel`, `maclient_dir`, `maclient_correo` y `maclient_atr` para el RIF indicado.',
  })
  @ApiParam({ name: 'cci_rif', type: String, example: '12345678', description: 'Cédula o RIF numérico del cliente' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          client:       [{ cci_rif: '12345678', xnombre: 'JUAN', xapellido: 'PÉREZ', isexo: 'M', iestado_civil: 'S', fnacimiento: '13-01-1990' }],
          clientTel:    [{ xtelefono: '04141234567' }],
          clientCorreo: [{ xcorreo: 'juan@email.com' }],
          clientDir:    [{ cestado: 1, cciudad: 128, xavecalle: 'AV PRINCIPAL' }],
          clientAtr:    [],
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'cci_rif no es numérico' })
  @ApiCommonErrors()
  async searchClient(@Param('cci_rif') cci_rif: string) {
    if (!/^\d+$/.test(cci_rif)) {
      throw new BadRequestException('cci_rif debe ser numérico.');
    }
    const data = await this.clientService.searchClient(cci_rif);
    return { status: true, data };
  }
}
