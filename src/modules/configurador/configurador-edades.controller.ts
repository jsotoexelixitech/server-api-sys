import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { ConfiguradorEdadesService } from './configurador-edades.service';
import { EdadesParentescoDto } from './dto/configurador-edades.dto';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;

/** Configurador fase 2: edades asegurables por parentesco del plan de personas (mapledades_per). */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador')
export class ConfiguradorEdadesController {
  constructor(private readonly edades: ConfiguradorEdadesService) {}

  @Get('planes/:cramo/:cplan/edades')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Edades por parentesco del plan de personas (mapledades_per)',
    description:
      '{ fdesde_plan (vigente), filas: [{ cparen, xparentesco, fdesde_plan, vigente, cemin_ase, cemax_ase, cemin_gi, cemax_gi, msvitalicia, ' +
      'msvitaliciaext, cereduccion, msreducida, msreducidaext }], parentescosConTarifa, sinEdad, avisos }. 400 si el plan no es de personas.',
    operationId: 'configuradorEdadesPlan',
  })
  async listar(@Param('cramo', ParseIntPipe) cramo: number, @Param('cplan') cplan: string) {
    return { status: true, data: await this.edades.listar(cramo, cplan) };
  }

  @Put('planes/:cramo/:cplan/edades/:cparen')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Crear o editar las edades de un parentesco en la versión vigente del plan (una fila por parentesco)',
    description:
      'Requiere CONFIGURADOR_PLANES_ESCRITURA=1 (si no, 403). { cemin_ase, cemax_ase, cemin_gi?, cemax_gi?, msvitalicia?, cereduccion?, ' +
      'msreducida? } (+ msvitaliciaext?, msreducidaext?). min ≤ max. En alta lo no enviado toma los valores de spMantPlanes (gi = ase, ' +
      'cereduccion = máx., montos 0). `avisos` si las tablas de tasas del parentesco no cubren el rango.',
    operationId: 'configuradorGuardarEdadesParentesco',
  })
  @ApiBody({ type: EdadesParentescoDto })
  async guardar(
    @Param('cramo', ParseIntPipe) cramo: number,
    @Param('cplan') cplan: string,
    @Param('cparen', ParseIntPipe) cparen: number,
    @Body() dto: EdadesParentescoDto,
  ) {
    return { status: true, data: await this.edades.guardar(cramo, cplan, cparen, dto) };
  }
}
