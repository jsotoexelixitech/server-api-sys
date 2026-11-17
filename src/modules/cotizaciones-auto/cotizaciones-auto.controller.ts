import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { CotizacionesAutoService, parseCproces } from './cotizaciones-auto.service';

const EJEMPLO = {
  status: true,
  data: {
    cproces: '202600310558',
    codigo: null,
    creadaEn: '2026-11-10T14:32:05.000Z',
    venceEl: '2026-11-25T14:32:05.000Z',
    vencida: false,
    ramo: 18,
    plan: { codigo: 'AutoV', nombre: 'Plan 10.000$ (RCV,EL,DP,APOV, CLUB DIAMANTE)' },
    productor: { codigo: 80080, nombre: 'PRODUCTOR DE EJEMPLO' },
    usuario: 7,
    vigencia: { desde: '2026-11-10', hasta: '2027-11-10', dias: 365 },
    tomador: { tipoDoc: 'V', documento: '12345678', nombre: 'JUAN PEREZ' },
    vehiculo: {
      marca: { codigo: '074', nombre: 'TOYOTA' },
      modelo: { codigo: '005', nombre: 'COROLLA' },
      version: { codigo: '67', nombre: 'LE Eco - CVT' },
      anio: 2015,
      tipo: { codigo: 1, nombre: 'PARTICULARES' },
      uso: { codigo: 1, nombre: 'PARTICULAR' },
      puestos: 5,
      toneladas: 0,
      tipoPlaca: 'N',
    },
    opciones: [
      {
        opcion: 1,
        primaUsd: 120.5,
        soloRcv: true,
        coberturas: [
          { codigo: 10, nombre: 'RCV DAÑOS A COSAS', primaUsd: 60.25, sumaAseguradaUsd: 5000, ajustePorcentaje: 0 },
          { codigo: 11, nombre: 'RCV DAÑOS A PERSONAS', primaUsd: 60.25, sumaAseguradaUsd: 5000, ajustePorcentaje: 0 },
        ],
      },
    ],
    emitida: false,
    poliza: null,
    opcionEmitida: null,
    emitible: true,
    motivos: [],
  },
};

@ApiTags(SWAGGER_TAGS.EMISSION)
@Controller('v1/cotizaciones-auto')
export class CotizacionesAutoController {
  constructor(private readonly service: CotizacionesAutoService) {}

  @Get(':cproces')
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_AUTO)
  @HttpCode(HttpStatus.OK)
  @ApiHeader(APIKEY_HEADER)
  @ApiParam({ name: 'cproces', description: 'Número de la cotización de SysIP (sopoliza.cproces), 1 a 20 dígitos.' })
  @ApiOperation({
    summary: 'Cotización de automóvil de SysIP para emitir RCV',
    description:
      'Detalle de una cotización del cotizador de SysIP (`sp_cotizaciones_get` o el API de SysIP si están ' +
      '`SYSIP_COTIZACIONES_URL` y `SYSIP_COTIZACIONES_APIKEY`) con lo necesario para emitirla como póliza RCV ' +
      '(`POST /emissions/automobile` con `cproces`).\n\n' +
      '`emitible` es false si hay `motivos`: CASCO (opción con Amplia, Pérdida total o Pérdida parcial → Auto Casco), ' +
      'EMITIDA, VENCIDA (15 días desde que se creó), RAMO (no es ramo 18) o RCVA (el plan emite el RCV aparte).\n\n' +
      'Errores: 400 `CPROCES_INVALIDO`, 404 `COTIZACION_NO_EXISTE`, 502 `COTIZACION_FUENTE_ERROR`, ' +
      '503 `COTIZACION_FUENTE_NO_DISPONIBLE`.\n\n' +
      '**Seguridad**: API Key o Bearer con scope `emissions:auto`.',
    operationId: 'getCotizacionAuto',
  })
  @ApiResponse({ status: 200, description: 'Cotización encontrada.', schema: { example: EJEMPLO } })
  @ApiResponse({ status: 404, description: 'COTIZACION_NO_EXISTE' })
  @ApiResponse({ status: 502, description: 'COTIZACION_FUENTE_ERROR' })
  @ApiResponse({ status: 503, description: 'COTIZACION_FUENTE_NO_DISPONIBLE' })
  @ApiCommonErrors()
  async getCotizacion(@Param('cproces') cproces: string) {
    return { status: true, data: await this.service.getCotizacion(parseCproces(cproces)) };
  }
}
