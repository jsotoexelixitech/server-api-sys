import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { SearchCoveragesDto } from './dto/search-coverages.dto';
import { SearchVehiclePoliciesDto } from './dto/search-vehicle-policies.dto';
import { SearchTitularContactoDto } from './dto/search-titular-contacto.dto';
import { ValidateSiniestroDto } from './dto/validate-siniestro.dto';

@ApiTags('7. Consulta de clientes')
@Controller('v1/client')
@NestProtected(NEST_AUTH_SCOPES.CLIENT_READ)
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  // Declarada antes de 'search/:cci_rif' para que no la capture ese parámetro.
  @Get('search/vehicle-policies')
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Pólizas de automóvil por vehículo, asegurado o cartera de productor',
    description:
      'Busca certificados de los ramos Automóvil (18) y RCV (26) por **placa** y/o **cci_rif** (asegurado o tomador). ' +
      'La **marca** solo se acepta junto con **cproductor**. Devuelve póliza, vigencia, estatus, vehículo, asegurado y ' +
      'coberturas activas contratadas con su suma asegurada. Incluye pólizas no vigentes: quien consume decide si la ' +
      'póliza cubría la fecha del evento. Si no hay coincidencias devuelve lista vacía. ' +
      '**El filtro por rol (asegurado = solo lo suyo) lo aplica quien consume**. ' +
      '**Seguridad**: requiere API Key con scope `client:read`.',
  })
  @ApiResponse({ status: 400, description: 'Faltan criterios mínimos o parámetros inválidos' })
  @ApiCommonErrors()
  async searchVehiclePolicies(@Query() query: SearchVehiclePoliciesDto) {
    const result = await this.clientService.searchVehiclePolicies(query);
    return { status: true, result };
  }

  // Antes de 'search/:cci_rif' para que no la capture ese parámetro.
  @Get('search/titular-contacto')
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Correo del titular de un vehículo (cédula + placa)',
    description:
      'Para el código de un solo uso del portal de siniestros. Solo hay coincidencia si existe una póliza de ' +
      'Automóvil/RCV con esa placa cuyo asegurado o tomador sea la cédula. **Devuelve el correo completo**: ' +
      'quien lo consume no debe mostrarlo entero al usuario. **Seguridad**: requiere API Key con scope `client:read`.',
  })
  @ApiResponse({ status: 200, schema: { example: { status: true, result: { encontrada: true, correo: 'titular@dominio.com' } } } })
  @ApiResponse({ status: 400, description: 'Cédula o placa inválidas' })
  @ApiCommonErrors()
  async getTitularContacto(@Query() query: SearchTitularContactoDto) {
    const result = await this.clientService.getTitularContacto(query);
    return { status: true, result };
  }

  @Get('siniestros/validar')
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Validar una declaración de siniestro (solo lectura)',
    description:
      'Usa `sp_valida_siniestro_nexus` (copia de `SpValidaSiniestro` de SIS2000): la póliza debe existir y estar activa, la fecha de ocurrencia dentro de su ' +
      'vigencia y el recibo de ese período cobrado. **No crea nada.** **Seguridad**: requiere API Key con scope `client:read`.',
  })
  @ApiResponse({ status: 200, schema: { example: { status: true, result: { valida: false, motivo: 'RECIBO_PENDIENTE', mensaje: 'La póliza posee recibos pendiente para la fecha de ocurrencia del siniestro' } } } })
  @ApiCommonErrors()
  async validarSiniestro(@Query() query: ValidateSiniestroDto) {
    const result = await this.clientService.validarSiniestro(query);
    return { status: true, result };
  }

  @Get('roles')
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Roles activos de SysIP',
    description:
      'Lista los roles activos (`serol`) con su departamento. Es un catálogo: no devuelve datos personales. ' +
      '**Seguridad**: requiere API Key con scope `client:read`.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { status: true, result: { roles: [{ crol: 13, xrol: 'Director', cdepartamento: 11, xdepartamento: 'Canales Alternos' }] } } },
  })
  @ApiCommonErrors()
  async listRoles() {
    const roles = await this.clientService.listRoles();
    return { status: true, result: { roles } };
  }

  @Get('search/policies/:cci_rif')
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Pólizas del asegurado',
    description:
      'Devuelve las pólizas vigentes e históricas asociadas a la cédula o RIF del asegurado. ' +
      '**Seguridad**: requiere API Key con scope `client:read`.',
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

  @Get('search/:cci_rif')
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Datos completos del cliente',
    description:
      'Consulta datos personales, teléfonos, direcciones y correos del cliente por cédula o RIF. ' +
      '**Seguridad**: requiere API Key con scope `client:read`.',
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

  @Post('search/coverages')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiOperation({
    summary: 'Coberturas de una póliza',
    description:
      'Consulta coberturas y datos de la póliza por número de póliza, año y mes. ' +
      'Devuelve información de la póliza y el detalle de coberturas contratadas. ' +
      '**Seguridad**: requiere API Key con scope `client:read`.',
  })
  @ApiBody({ type: SearchCoveragesDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        result: {
          poliza: [
            {
              cpoliza: 900000000065412,
              fanopol: 2025,
              fmespol: 9,
              cramo: 9,
              cplan: 'COLFU1',
              xplan: 'Plan I 2.000$ Funerario Colmena',
            },
          ],
          coberturas: [
            {
              cramo: 9,
              cplan: 'COLFU1',
              ccobertura: 1,
              xcobertura: 'Plan Colmena Funerario I',
              msumaaseg: 2000,
            },
          ],
        },
      },
    },
  })
  @ApiCommonErrors()
  async searchCoverages(@Body() body: SearchCoveragesDto) {
    const result = await this.clientService.searchCoverages(body);
    return { status: true, result };
  }
}
