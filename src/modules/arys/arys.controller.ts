import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import {
  ArysMembershipConfigService,
  ArysMembershipConfigValues,
} from './arys-membership-config.service';
import { ArysMembershipJobService } from './arys-membership-job.service';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { ArysService } from './arys.service';
import { ArysRegisterMembershipInput } from './arys.types';

@ApiTags('Arys / Sarys')
@Controller('v1/arys')
export class ArysController {
  constructor(
    private readonly arysService: ArysService,
    private readonly jobs: ArysMembershipJobService,
    private readonly membershipConfig: ArysMembershipConfigService,
  ) {}

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

  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @Get('membership/jobs')
  @ApiOperation({
    summary: 'Respaldo de membresías Arys',
    description: 'Lista trabajos con su estado (PENDING | RETRYING | SUCCESS | FAILED | DEAD) y últimos intentos.',
  })
  async listJobs(@Query('status') status?: string, @Query('limit') limit?: string) {
    const result = await this.jobs.list({ status, limit: limit ? Number(limit) : undefined });
    return { status: true, result };
  }

  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @Post('membership/retry')
  @ApiOperation({
    summary: 'Reintentar membresías Arys fallidas vencidas',
    description: 'Procesa hasta batch_size trabajos FAILED cuyo next_retry_at ya venció.',
  })
  async retryDue() {
    const { batchSize } = await this.membershipConfig.get();
    const result = await this.arysService.retryDueMemberships(batchSize);
    return { status: true, result };
  }

  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @Post('membership/:cnpoliza/retry')
  @ApiOperation({
    summary: 'Reintentar la membresía Arys de una póliza',
    description: 'Retoma desde lo ya creado en Arys. Aplica también a trabajos DEAD.',
  })
  @ApiParam({ name: 'cnpoliza', type: String })
  async retryOne(@Param('cnpoliza') cnpoliza: string) {
    const result = await this.arysService.retryMembership(cnpoliza);
    return { status: Boolean(result), result };
  }

  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @Get('membership/config')
  @ApiOperation({ summary: 'Configuración del reintento de membresías Arys (guardada en BD)' })
  async getConfig() {
    return { status: true, result: await this.membershipConfig.get() };
  }

  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @Put('membership/config')
  @ApiOperation({
    summary: 'Actualizar la configuración del reintento (sin reiniciar PM2)',
    description:
      'Campos opcionales: retryEnabled, retryIntervalSeconds, maxAttempts, retryBaseMinutes, retryMaxMinutes, batchSize. Se aplica en ~30 s.',
  })
  async updateConfig(@Body() body: Partial<ArysMembershipConfigValues>) {
    return { status: true, result: await this.membershipConfig.update(body) };
  }
}
