import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RiesgosGeneralesService } from './riesgos-generales.service';
import { CoberturasRamoDto, CotizarCoberturasDto, EmitirCoberturasDto, TarifaPlanDto } from './dto/riesgos-generales.dto';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';

@ApiTags('2. Cotización y catálogos')
@Controller('v1/riesgos-generales')
export class RiesgosGeneralesController {
  constructor(private readonly service: RiesgosGeneralesService) {}

  @Get('tarifa')
  @ApiOperation({
    summary: 'Tarifa por cobertura de un plan (ramos 16, 25 y 38)',
    description:
      'Coberturas del plan (maplantar) con la tasa y los topes vigentes de matarifa_d, si son obligatorias (matarifa.bobligatoria ' +
      'o cobertura básica) y la comisión. `msumaplan` es la suma del plan, usada como valor por defecto.',
    operationId: 'riesgosGeneralesTarifa',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiCommonErrors()
  async tarifa(@Query() dto: TarifaPlanDto) {
    return { status: true, data: await this.service.getTarifa(dto) };
  }

  @Get('coberturas')
  @ApiOperation({
    summary: 'Coberturas del ramo con tarifa vigente',
    description:
      'Todas las coberturas activas del ramo (macoberturas) con tarifa vigente en matarifa y matarifa_d, sin depender de ' +
      'un plan; el cotizador RC arma con ellas las combinaciones. Por cobertura y tarifa: `pprima` (tasa %) y `mprima` ' +
      '(prima fija) de matarifa_d, topes `msumamin`/`msumamax` (0 = sin tope), `obligatoria` (matarifa.bobligatoria o ' +
      'cobertura básica), `cmoneda` de macoberturas y `pcomision` de maarancel. Si una cobertura tiene varias tarifas ' +
      'vigentes sale una vez por tarifa. Cualquier ramo; solo lectura.',
    operationId: 'riesgosGeneralesCoberturasRamo',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiCommonErrors()
  async coberturas(@Query() dto: CoberturasRamoDto) {
    return { status: true, data: await this.service.getCoberturasRamo(dto) };
  }

  @Get('ramos')
  @ApiOperation({
    summary: 'Ramos patrimoniales (ctiporamo 1 y 6)',
    description:
      'Todos los ramos vigentes de maramos con ctiporamo 1 y 6 (sin RCV, ramo 26), tengan o no planes. Por ramo: ' +
      '`cramo`, `xramo`, `ctiporamo` y `qcoberturas` = coberturas activas con tarifa vigente en matarifa y matarifa_d ' +
      '(las mismas que devuelve GET coberturas); 0 = el ramo no se puede cotizar por cobertura. Solo lectura.',
    operationId: 'riesgosGeneralesRamos',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiCommonErrors()
  async ramos() {
    return { status: true, data: await this.service.getRamos() };
  }

  @Post('cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar coberturas elegidas',
    description:
      'Prima de cada cobertura = suma × tasa de matarifa_d / 100. Valida obligatorias, topes y tasas vigentes. ' +
      'Con `calculo` (unidades × valor_unidad) la suma de todas las coberturas pedidas se calcula en el servidor y se ignora `suma`. ' +
      '`datos_bien` devuelve el texto de xdescrip3 y xdescrip4 y lo que no cupo; `biomasa` (ramo 25) devuelve además la curva, ' +
      'los días, Gv, Gi, el engorde y la biomasa esperados y la retención de A. Si el lote ya tiene póliza vigente no rechaza: agrega `aviso_lote`.',
    operationId: 'riesgosGeneralesCotizacion',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({
    type: CotizarCoberturasDto,
    examples: {
      hogar: { value: { cramo: 38, cplan: '2', coberturas: [{ ccober: '1', suma: 140000 }, { ccober: '5', suma: 24000 }] } },
      calculo: { value: { cramo: 25, cplan: '1', coberturas: [{ ccober: '1' }], calculo: { unidades: 20000, valor_unidad: 2.5 } } },
      biomasa: {
        value: {
          cramo: 25, cplan: 'PAS06', coberturas: [{ ccober: '901' }, { ccober: '902' }, { ccober: '903' }],
          calculo: { unidades: 20000, valor_unidad: 2.5 },
          biomasa: {
            cantidad_animales: 100, peso_promedio: 200, fecha_inicio: '2026-11-05', horizonte_meses: 6,
            lote: 'LT-2026-001', ihl: '0,92',
          },
        },
      },
    },
  })
  @ApiCommonErrors()
  async cotizar(@Body() dto: CotizarCoberturasDto) {
    return { status: true, data: await this.service.cotizar(dto) };
  }

  @Post('emision')
  @HttpCode(HttpStatus.OK)
  @NestProtected(NEST_AUTH_SCOPES.EMISSIONS_RIESGOS_GENERALES)
  @ApiOperation({
    summary: 'Emitir con las coberturas elegidas',
    description:
      'Recalcula la cotización en el servidor (no acepta primas del cliente) y emite cobertura por cobertura con ' +
      'sp_pre_emision_condominio_nexus. Recibo pendiente de cobro. Acepta `calculo` (suma = unidades × valor_unidad) y ' +
      '`meses` de vigencia (1 a 60; sin enviar, 1 año, o el horizonte si viene `biomasa`), `datos_bien` (xdescrip3 y xdescrip4) ' +
      'y `biomasa`, que exige lote e ihl. Con `biomasa`, responde 409 si el lote ya tiene póliza vigente en el ramo, sea cual sea ' +
      'el tomador, el asegurado o el plan. Ramos habilitados: RIESGOS_GENERALES_RAMOS_EMISION (lista de cramo o `todos` = ' +
      'patrimoniales vigentes sin RCV; por defecto 16, 25 y 38). `modo: combo` emite cualquier cobertura del ramo con tarifa vigente ' +
      '(prima = suma × tasa / 100 o la prima fija) usando `cplan` como plan contenedor (vigente del mismo ramo). Antes del SP ' +
      'valida que cada cobertura exista activa en el ramo, tenga matarifa y exactamente una fila en matarifa_d (400 si no). ' +
      'Ramos 28 y 38 exigen `apartamento`; el duplicado de póliza vigente del SP responde 409 con mensaje claro. ' +
      'Requiere el scope `emissions:riesgos-generales`.',
    operationId: 'riesgosGeneralesEmision',
  })
  @ApiHeader(APIKEY_HEADER)
  @ApiBody({ type: EmitirCoberturasDto })
  @ApiCommonErrors()
  async emitir(@Body() dto: EmitirCoberturasDto) {
    return { status: true, data: await this.service.emitir(dto) };
  }
}
