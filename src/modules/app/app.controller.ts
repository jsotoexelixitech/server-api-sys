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
    // La nueva API devuelve el cálculo por asegurado.
    // Como el SP actual (spCalculoPer) lo llama de uno en uno y suma en personasService,
    // reutilizamos la lógica de cotizar. Podríamos cotizar cada asegurado individualmente
    // si necesitamos el breakdown, o devolver todo en un solo bucket si la UI acepta 1 solo total.
    // La UI espera result.data[i].total_asegurado[0].mprimaext
    
    // Para no romper la cotización masiva, devolvemos el total de forma simulada en el index 0.
    // O mejor, cotizamos individualmente para construir la respuesta exacta que espera la UI.
    const resultData = [];
    let mprimatotal = 0;
    let mprimatotalext = 0;

    for (const asegurado of dto.asegurados) {
      const individualDto: CotizacionPerDto = {
        ...dto,
        asegurados: [asegurado]
      };
      const result = await this.personasService.getCotizacionPer(individualDto);
      resultData.push({
        total_asegurado: [
          {
            mprima: result.mprima,
            mprimaext: result.mprimaext,
          }
        ]
      });
      mprimatotal += result.mprima;
      mprimatotalext += result.mprimaext;
    }

    return {
      status: true,
      result: {
        data: resultData,
        total_extension: {
          mprimatotal: parseFloat(mprimatotal.toFixed(2)),
          mprimatotalext: parseFloat(mprimatotalext.toFixed(2)),
        }
      }
    };
  }
}
