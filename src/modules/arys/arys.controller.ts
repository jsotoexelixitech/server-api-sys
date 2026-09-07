import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { ArysService } from './arys.service';
import { ArysRegisterMembershipInput } from './arys.types';

@ApiTags('Arys / Sarys')
@Controller('v1/arys')
export class ArysController {
  constructor(private readonly arysService: ArysService) {}

  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @Get('coberturas/:vehiculoId/:tipoMembresia')
  @ApiOperation({
    summary: 'Consultar primas Arys (Coberturas)',
    description:
      'GET /api/v1/Cotizador/Coberturas/{vehiculoId}/{tipoMembresia} en Sarys.',
  })
  @ApiParam({ name: 'vehiculoId', type: Number })
  @ApiParam({ name: 'tipoMembresia', type: Number, description: 'RCV obsequio = 6' })
  async getCoberturas(
    @Param('vehiculoId', ParseIntPipe) vehiculoId: number,
    @Param('tipoMembresia', ParseIntPipe) tipoMembresia: number,
  ) {
    const primas = await this.arysService.getPrimas(vehiculoId, tipoMembresia);
    return {
      status: true,
      vehiculoId,
      tipoMembresia,
      primas,
    };
  }

  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @Post('membership/register')
  @ApiOperation({
    summary: 'Registrar membresía Arys post-emisión RCV',
    description:
      'Orquesta AddPropetario → AddVehiculo → Coberturas → RegistrarSubcripcion usando datos de Sis2000.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cnpoliza: { type: 'string' },
        cpoliza: { type: 'string' },
        xplaca: { type: 'string' },
        tipoMembresia: { type: 'number', example: 6 },
      },
    },
  })
  async registerMembership(@Body() body: ArysRegisterMembershipInput) {
    const result = await this.arysService.registerMembershipFromEmission(body);
    return {
      status: Boolean(result),
      result,
    };
  }
}
