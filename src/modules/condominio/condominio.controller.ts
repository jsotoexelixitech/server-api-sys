import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CondominioService } from './condominio.service';
import { GetPlanesCondominioDto } from './dto/get-planes-condominio.dto';
import { CotizacionCondominioDto } from './dto/cotizacion-condominio.dto';
import { CreateEmissionCondominioDto } from './dto/create-emission-condominio.dto';
import { GetByRamoDto } from './dto/get-by-ramo.dto';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NestApiKey } from '../auth/decorators/nest-api-key.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiTags('9. Emisión condominio')
@Controller('v1/condominio')
export class CondominioController {
  constructor(private readonly condominioService: CondominioService) {}

  @Get('productos')
  @ApiOperation({
    summary: 'Catálogo de productos de condominio y hogar',
    description: 'Retorna el catálogo estático de los tres productos soportados (Hogar, Vecinos, Condominio) con sus respectivos códigos de ramo (cramo) y códigos de plan por defecto (cplan). Útil para que los desarrolladores identifiquen los códigos correctos a usar.',
  })
  @ApiResponse({
    status: 200,
    description: 'Catálogo de productos devuelto con éxito.',
    schema: {
      example: {
        status: true,
        data: [
          {
            id: 'hogar',
            nombre: 'Seguro Combinado Residencial (Hogar)',
            cramo: 38,
            cplan_defecto: 'RESIDE',
            descripcion: 'Protección para el hogar y vivienda principal contra incendios, terremoto, daños por agua, inundación, robo y responsabilidad civil de predios.'
          },
          {
            id: 'vecinos',
            nombre: 'Responsabilidad Civil General (Vecinos)',
            cramo: 28,
            cplan_defecto: 'BINAC',
            descripcion: 'Cobertura de responsabilidad civil para cubrir daños corporales o materiales causados a terceros o vecinos.'
          },
          {
            id: 'condominio',
            nombre: 'Combinado Empresarial (Condominio)',
            cramo: 16,
            cplan_defecto: 'CONDOM',
            descripcion: 'Seguro combinado multirriesgo para la protección de áreas comunes de condominios, locales comerciales y oficinas.'
          }
        ]
      }
    }
  })
  getProductos() {
    return {
      status: true,
      data: [
        {
          id: 'hogar',
          nombre: 'Seguro Combinado Residencial (Hogar)',
          cramo: 38,
          cplan_defecto: 'RESIDE',
          descripcion: 'Protección para el hogar y vivienda principal contra incendios, terremoto, daños por agua, inundación, robo y responsabilidad civil de predios.'
        },
        {
          id: 'vecinos',
          nombre: 'Responsabilidad Civil General (Vecinos)',
          cramo: 28,
          cplan_defecto: 'BINAC',
          descripcion: 'Cobertura de responsabilidad civil para cubrir daños corporales o materiales causados a terceros o vecinos.'
        },
        {
          id: 'condominio',
          nombre: 'Combinado Empresarial (Condominio)',
          cramo: 16,
          cplan_defecto: 'CONDOM',
          descripcion: 'Seguro combinado multirriesgo para la protección de áreas comunes de condominios, locales comerciales y oficinas.'
        }
      ]
    };
  }

  @Post('planes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consultar planes y coberturas por Ramo',
    description: `Obtiene los planes activos, las coberturas configuradas (agrupadas dentro de cada plan), los dispositivos de seguridad y las sustancias peligrosas asociadas al ramo. 
    
*   **Hogar**: cramo 38 (plan por defecto: RESIDE)
*   **Vecinos**: cramo 28 (plan por defecto: BINAC)
*   **Condominio**: cramo 16 (plan por defecto: CONDOM)
    
*Nota: Si se envía el campo 'cplan', se filtrará únicamente ese plan. Si se omite, se retornarán todos los planes del ramo con sus coberturas para poder compararlos.*`,
  })
  @ApiBody({
    type: GetPlanesCondominioDto,
    examples: {
      porDefecto: {
        summary: 'Consulta de Hogar (Ramo 38)',
        value: { cramo: 38 }
      },
      conPlanEspecifico: {
        summary: 'Consulta con Plan Específico',
        value: { cramo: 38, cplan: 'RESIDE' }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Catálogo de planes y coberturas devuelto con éxito.',
    schema: {
      example: {
        status: true,
        data: {
          planes: [
            {
              cramo: 38,
              cplan: 'RESIDE',
              xplan: 'Plan Vivienda Principal',
              xplan_c: 'Plan Vivienda Principal',
              cmoneda: '$',
              iestado: 'V',
              coberturas: [
                {
                  ccober: '1',
                  xcobertura: 'COMBINADO RESIDENCIAL (BÁSICA)',
                  ctarifa: '1',
                  xtarifa: 'COMBINADO RESIDENCIAL (BÁSICA)',
                  msumamin: 50000.00,
                  msumamax: 50000.00,
                  pprima: 0.04,
                  mprima: 0.00,
                  iestado: 'V'
                }
              ]
            }
          ],
          dispositivos: [
            {
              cdisseg: 1,
              xdisseg: 'Cámaras de Seguridad',
              pdisseg: 5.00
            }
          ],
          sustancias: [
            {
              csustanc: 1,
              xsustanc: 'Bombonas de Gas',
              porcenta: 15.00
            }
          ]
        }
      }
    }
  })
  @ApiCommonErrors()
  async getPlanes(@Body() dto: GetPlanesCondominioDto) {
    const data = await this.condominioService.getPlanes(dto);
    return { status: true, data };
  }

  @Post('cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar póliza de condominio u hogar',
    description: `Realiza el cálculo de primas brutas, netas, comisiones y totales por cada cobertura del plan seleccionado aplicando descuentos por dispositivos de seguridad y recargos por sustancias peligrosas. 
    
*   **Descuentos**: Se aplican acumulando el porcentaje de los dispositivos seleccionados (enviados en el array 'dispositivos').
*   **Recargos**: Se aplican acumulando el porcentaje de las sustancias declaradas (enviados en el array 'sustancias').
*   *La suma asegurada y la tasa de cambio se obtienen de forma automática del plan, por lo que no es necesario enviarlas en la petición.*`,
  })
  @ApiBody({
    type: CotizacionCondominioDto,
    examples: {
      cotizacionHogarConDescuentos: {
        summary: 'Cotización Hogar con descuentos y recargos',
        value: {
          cramo: 38,
          cplan: 'RESIDE',
          ifrecuencia: 'M',
          dispositivos: [1, 2],
          sustancias: [1]
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Cotización calculada de forma exitosa.',
    schema: {
      example: {
        status: true,
        data: {
          coberturas: [
            {
              ccober: '1',
              xcobertura: 'COMBINADO RESIDENCIAL (BÁSICA)',
              ctarifa: '1',
              xtarifa: 'COMBINADO RESIDENCIAL (BÁSICA)',
              msumabrutaext: 50000.00,
              msumabruta: 37281855.00,
              mprimabrutaext: 4.30,
              mprimabruta: 3200.02,
              mdescuentoext: 0.65,
              mdescuento: 480.00,
              mrecargoext: 0.65,
              mrecargo: 480.00,
              mprimaext: 4.30,
              mprima: 3200.02,
              pprima: 0.04,
              pcomision: 15.00,
              mcomisionext: 0.65,
              mcomision: 480.00
            }
          ],
          totales: {
            msumaasegext: 50000.00,
            msumaaseg: 37281855.00,
            mprimabrutaext: 4.30,
            mprimabruta: 3200.02,
            mdescuentoext: 0.65,
            mdescuento: 480.00,
            mrecargoext: 0.65,
            mrecargo: 480.00,
            mprimaext: 4.30,
            mprima: 3200.02,
            mcomisionext: 0.65,
            mcomision: 480.00,
            pdescuentototal: 15.00,
            precargototal: 15.00
          }
        }
      }
    }
  })
  @ApiCommonErrors()
  async cotizar(@Body() dto: CotizacionCondominioDto) {
    const data = await this.condominioService.cotizar(dto);
    return { status: true, data };
  }

  @Post('emision')
  @HttpCode(HttpStatus.OK)
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_CONDOMINIO)
  @ApiOperation({
    summary: 'Emitir póliza definitiva',
    description: `Valida y emite la póliza en el core de Sis2000 registrando al tomador, asegurado, datos del certificado, dispositivos de seguridad, sustancias peligrosas y el inventario de equipos del local.
    
*   **Equipos**: Se detalla el arreglo de maquinarias u objetos del local (planta eléctrica, bombas de agua, etc.).
*   **Seguridad**: Requiere autenticación mediante API Key en el header 'apikey' y disponer del scope 'emissions:condominio'.`,
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({
    type: CreateEmissionCondominioDto,
    examples: {
      emisionHogarCompleta: {
        summary: 'Payload de Emisión Completo (Hogar)',
        value: {
          cramo: 38,
          plan: 'RESIDE',
          frecuencia: 'M',
          xdirecob: 'Calle Principal, Casa Nro 5',
          xdireccion: 'Chacao, Caracas',
          xdescrip1: 'Casa de concreto',
          xdescrip2: 'Residencial',
          dispositivos: [1],
          sustancias: [],
          equipos: [
            {
              xdescrip: 'Bomba de Agua Hidroneumática 5HP',
              anofab: 2022,
              msumasetotloc: 5000,
              msumasetot: 5000,
              cantidad: 1
            }
          ],
          tipo_cedula_tomador: 'V',
          rif_tomador: 98765432,
          nombre_tomador: 'Juan',
          apellido_tomador: 'Perez',
          sexo_tomador: 'M',
          estado_civil_tomador: 'S',
          fnac_tomador: '1985-05-15',
          estado_tomador: '1',
          ciudad_tomador: '1',
          direccion_tomador: 'Av. Francisco de Miranda',
          telefono_tomador: '04121234567',
          correo_tomador: 'juan.perez@mail.com',
          tipo_cedula_asegurado: 'V',
          rif_asegurado: 98765432,
          nombre_asegurado: 'Juan',
          apellido_asegurado: 'Perez',
          sexo_asegurado: 'M',
          estado_civil_asegurado: 'S',
          fnac_asegurado: '1985-05-15',
          estado_asegurado: '1',
          ciudad_asegurado: '1',
          direccion_asegurado: 'Av. Francisco de Miranda',
          telefono_asegurado: '04121234567',
          correo_asegurado: 'juan.perez@mail.com',
          productor: 80080,
          ctipocanal: 'D',
          xcanal_venta: 'TEST_NEXUS'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Póliza emitida exitosamente en Sis2000.',
    schema: {
      example: {
        status: true,
        result: {
          message: 'Emisión registrada exitosamente.',
          cpoliza: 3800000000000189312,
          cnpoliza: '38-1-1100011444',
          cproces: 202600231179,
          iestado: 2,
          xestado: 'COMPLETED'
        }
      }
    }
  })
  @ApiCommonErrors()
  async emitir(@NestApiKey() apikey: string, @Body() dto: CreateEmissionCondominioDto) {
    const result = await this.condominioService.emitir(dto);
    return { status: true, result };
  }

  @Get('frecuencias')
  @ApiOperation({
    summary: 'Listar frecuencias de pago',
    description: 'Retorna las frecuencias de pago válidas en el sistema con sus respectivos códigos y el número de cuotas fraccionadas correspondientes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de frecuencias devuelta con éxito.',
    schema: {
      example: {
        status: true,
        data: [
          { codigo: 'A', descripcion: 'Anual', cuotas: 1 },
          { codigo: 'S', descripcion: 'Semestral', cuotas: 2 },
          { codigo: 'T', descripcion: 'Trimestral', cuotas: 4 },
          { codigo: 'M', descripcion: 'Mensual', cuotas: 12 },
          { codigo: 'E', descripcion: 'Pago Único / Especial', cuotas: 1 }
        ]
      }
    }
  })
  async getFrecuencias() {
    const data = await this.condominioService.getFrecuencias();
    return { status: true, data };
  }

  @Get('dispositivos')
  @ApiOperation({
    summary: 'Listar dispositivos de seguridad por ramo',
    description: 'Obtiene los dispositivos de seguridad configurados para el ramo seleccionado, los cuales aplican un porcentaje de descuento acumulable en la cotización.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de dispositivos de seguridad devuelta con éxito.',
    schema: {
      example: {
        status: true,
        data: [
          { cdisseg: 1, xdisseg: 'Camaras de Seguridad', pdisseg: 5.00 }
        ]
      }
    }
  })
  async getDispositivos(@Query() query: GetByRamoDto) {
    const data = await this.condominioService.getDispositivos(query.cramo);
    return { status: true, data };
  }

  @Get('sustancias')
  @ApiOperation({
    summary: 'Listar sustancias peligrosas por ramo',
    description: 'Obtiene las sustancias peligrosas configuradas para el ramo seleccionado, las cuales aplican un porcentaje de recargo acumulable en la cotización.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de sustancias peligrosas devuelta con éxito.',
    schema: {
      example: {
        status: true,
        data: [
          { csustanc: 1, xsustanc: 'Bombonas de Gas', porcenta: 15.00 }
        ]
      }
    }
  })
  async getSustancias(@Query() query: GetByRamoDto) {
    const data = await this.condominioService.getSustancias(query.cramo);
    return { status: true, data };
  }
}
