import { Body, Controller, HttpCode, HttpStatus, Post, BadRequestException } from '@nestjs/common';
import { ApiExcludeController, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PersonasService } from '../personas/personas.service';
import { CotizacionPerDto } from '../personas/dto/cotizacion-per.dto';
import { Api500, ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiExcludeController()
@ApiTags('app')
@Controller('v1/app')
export class AppController {
  constructor(private readonly personasService: PersonasService) {}

  @Post('getParenPlanPer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Parentescos válidos para un plan de personas',
    description: 'Devuelve los parentescos permitidos para un plan y ramo específicos.',
  })
  @ApiBody({
    schema: {
      example: { cramo: 9, cplan: 'FUNBAS' },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        result: { records: [{ cparen: 1, xparentesco: 'TITULAR' }] },
      },
    },
  })
  @Api500()
  async getParenPlanPer(@Body() body: { cramo: number; cplan: string }) {
    if (!body.cramo || !body.cplan) {
      throw new BadRequestException('Los parámetros cramo y cplan son obligatorios.');
    }
    const records = await this.personasService.getParenPlanPer(body.cramo, body.cplan);
    return { status: true, result: { records } };
  }

  @Post('getCotizacionPer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar prima de personas (Funerario) - Formato nueva UI',
    description: 'Devuelve la cotización mapeada al formato anidado esperado por la UI (total_asegurado, total_extension).',
  })
  @ApiBody({ type: CotizacionPerDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        result: {
          data: [{ total_asegurado: [{ mprima: 150, mprimaext: 3.7 }] }],
          total_extension: { mprimatotal: 150, mprimatotalext: 3.7 },
        },
      },
    },
  })
  @ApiCommonErrors()
  async getCotizacionPer(@Body() dto: CotizacionPerDto) {
    const result = await this.personasService.buildCotizacionPerLegacyResult(dto);
    return { status: true, result };
  }
}
