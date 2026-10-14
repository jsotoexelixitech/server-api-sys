import { applyDecorators, Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { EndososCoreService, CoreResult } from './endosos-core.service';
import {
  AnularRecibosCoreRequestDoc,
  CalcularPlanRequestDoc,
  PlanCoberturasRequestDoc,
  PoliciesInfoRequestDoc,
  PolizaOnlyRequestDoc,
  PolizaRecibosRequestDoc,
  PolizaSearchRequestDoc,
} from './dto/core-requests.dto';
import { Api401 } from '../../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../../auth/scopes/nest-auth-scopes.constants';

/** Error de negocio/SQL con el contrato del Core: `{ status:false, message }` (+ `code` en 500). */
const CoreError = (status: 400 | 404 | 500, description: string, message: string) =>
  ApiResponse({
    status,
    description,
    schema: {
      example: status === 500 ? { status: false, message, code: 500 } : { status: false, message },
    },
  });

const CoreAuthErrors = () =>
  applyDecorators(
    Api401(),
    ApiResponse({
      status: 403,
      description: 'La clave de API no tiene el scope `endosos:write`.',
      schema: {
        example: {
          status: false,
          statusCode: 403,
          message: 'Permiso requerido: endosos:write. Key no autorizada para este endpoint.',
        },
      },
    }),
  );

const POLIZA_EJEMPLO = {
  Nro_Poliza: '18-1-0130480661',
  fanopol: 2026,
  fmespol: 10,
  cprog: 'TEmision_Auto_RCV2',
  CID: 'V-10870482',
  Nombre_del_Tomador: 'PEREZ GOMEZ , MARIA ELENA',
  Codigo_Ramo: 18,
  Id_Asegurado: 'V-14484939',
  Nombre_Asegurado: 'JUAN CARLOS RODRIGUEZ',
  Descripcion_Ramo: 'AUTOMOVIL',
  Fecha_desde_Pol: '07-10-2026',
  Fecha_hasta_Pol: '07-10-2027',
  Dias_de_vigencia: 365,
  Sucursal: 'CARACAS',
  cproductor: 215,
  Moneda: 'DOLARES',
  Tasa_Cambio: 873.867,
  Tipo_Renovacion: 'Anual',
  Estatus_Poliza: 'Vigente',
  Plan: 'RCVBAS',
  Descripcion_Plan: 'Plan Básico RCV',
  CoberArys: 1,
  recibos: [
    {
      cnrecibo: '18-100282790',
      fanopol: 2026,
      fmespol: 10,
      Cuotas: 1,
      Fdesde_Rec: '07-10-2026',
      Fhasta_Rec: '07-10-2027',
      Monto_Rec: 14200.5,
      Monto_Rec_Ext: 16.25,
      Fecha_Cobro: 'N/A',
      Status_Rec: 'Pendiente',
      crecibo: 1800000000000250123,
      ctransaccion: 'N/A',
    },
  ],
};

@ApiTags(SWAGGER_TAGS.ENDOSOS)
@Controller('endosos/core')
@NestProtected(NEST_AUTH_SCOPES.ENDOSOS_WRITE)
export class EndososCoreController {
  constructor(private readonly core: EndososCoreService) {}

  private send(res: Response, result: CoreResult) {
    res.status(result.httpStatus);
    return result.body;
  }

  // ───────────────────────────── Consulta ─────────────────────────────────────

  @Post('policies-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cartera con datos de contacto',
    operationId: 'endososCorePoliciesInfo',
    description:
      'Lista pólizas **que tienen teléfono o correo registrado** (las usa Endosos para cartera masiva y campañas).\n\n' +
      '- **Clave en Parametrización:** `searchPolicies`.\n' +
      '- **Paginación:** `page` + `steps` (o `limit`). Sin ellos devuelve todo el resultado.\n' +
      '- **Filtros:** `ccorredor`, `cramo`, `cplan`, `casegurado`, `cnpoliza` (contiene). Se combinan con AND.\n' +
      '- `includeReceipts` / `includeCoverages` añaden `recibos[]` / `coberturasReal[]` por póliza.\n' +
      '- `campanaInfo` cuenta **todas** las pólizas del filtro (con y sin contacto); `pagination.total` solo las que tienen contacto.\n\n' +
      '**Equivale a** `POST /api/v1/client/search/policies-info` de SysIP-backend.',
  })
  @ApiBody({
    type: PoliciesInfoRequestDoc,
    examples: {
      paginado: { summary: 'Página 1 de automóvil', value: { page: 1, steps: 50, cramo: 18 } },
      porProductor: {
        summary: 'Cartera de un productor con recibos y coberturas',
        value: { ccorredor: 215, cramo: 18, page: 1, steps: 20, includeReceipts: true, includeCoverages: true },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Pólizas con contacto, resumen de campaña y paginación.',
    schema: {
      example: {
        status: true,
        result: {
          polizas: [
            {
              nroPoliza: '18-1-1130480713',
              codigoRamo: 18,
              descripcionRamo: 'AUTOMOVIL',
              plan: 'MulCar',
              descripcionPlan: 'Plan 1.000$ (RCV,EL,DP,APOV, CLUB BASICO)',
              cciRif: '26946571',
              cid: 'V-26946571',
              nombreDelTomador: 'Ana Martínez',
              nombreAsegurado: 'Ana Martínez',
              iSexo: 'F',
              iEstadoCivil: 'S',
              fNacimiento: '06-09-1998',
              telefonos: [{ xTelefono: '04120000000' }],
              correos: [{ xCorreo: 'ana@correo.com' }],
              direcciones: [{ cEstado: 1, cCiudad: 28, xAveCalle: 'Av. Principal' }],
              fanopol: 2026,
              fmespol: 10,
              cprog: 'Emi_Auto',
              fechaDesdePol: '09-10-2026',
              fechaHastaPol: '09-10-2027',
              estatusPoliza: 'Vigente',
              sumaAsegurada: 0,
              coberArys: 0,
              moneda: 'DOLARES',
              sucursal: 'CARACAS',
              intermediario: ['1 - EJEMPLO CORREDORES', 'LA MUNDIAL DE SEGUROS'],
              segmento: 'particular',
              descripcionSegmento: 'Particular',
              tipoRenovacion: '',
              siniestros: 0,
            },
          ],
          campanaInfo: { totalPolizas: 151564, conContacto: 5609, sinContacto: 145955 },
          pagination: { total: 5609, page: 1, limit: 50, pages: 113 },
        },
      },
    },
  })
  @CoreError(400, 'page o limit/steps menores a 1.', 'El parámetro page debe ser mayor a 0.')
  @CoreError(500, 'Error de base de datos.', 'Mensaje del error SQL.')
  @CoreAuthErrors()
  async policiesInfo(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.policiesInfo(body ?? {}));
  }

  @Post('poliza')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar póliza con sus recibos',
    operationId: 'endososCorePoliza',
    description:
      'Busca pólizas y devuelve, por cada una, sus datos principales con los **recibos** agrupados.\n\n' +
      '- **Clave en Parametrización:** `getPolicyById`.\n' +
      '- **Prioridad del filtro:** `cnpoliza` → `cgestor` → `ccorredor` → `casegurado`. `cramo` se suma a cualquiera.\n' +
      '- La respuesta es un **objeto** `data.list` cuya clave es `<cpoliza>-<año>-<mes>` (una póliza puede tener varias emisiones).\n' +
      '- Sin filtros ni paginación devuelve máximo 500.\n\n' +
      '**Equivale a** `POST /api/v1/poliza/searchPoliza` de SysIP-backend.',
  })
  @ApiBody({
    type: PolizaSearchRequestDoc,
    examples: {
      porNumero: { summary: 'Por número de póliza', value: { cnpoliza: '18-1-0130480661' } },
      porAsegurado: { summary: 'Por cédula del asegurado', value: { casegurado: 'V-14484939', cramo: 18, page: 1, steps: 20 } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Pólizas encontradas, indexadas por `<cpoliza>-<año>-<mes>`.',
    schema: { example: { status: true, data: { list: { '1800000000000170471-2026-10': POLIZA_EJEMPLO } } } },
  })
  @CoreError(500, 'Error de base de datos.', 'Mensaje del error SQL.')
  @CoreAuthErrors()
  async poliza(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.searchPoliza(body ?? {}));
  }

  @Post('poliza-only')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar póliza (versión liviana, sin recibos)',
    operationId: 'endososCorePolizaOnly',
    description:
      'Igual que `poliza` pero sin joins de recibos ni asegurados: más rápida. Devuelve una **lista** plana y el total.\n\n' +
      '- **Clave en Parametrización:** `getPolicyById` (alternativa).\n' +
      '- Cada clave del body (salvo `page`/`steps`) es un filtro de **igualdad** sobre `adpoliza`; solo se aceptan columnas ' +
      'conocidas (cnpoliza, cpoliza, cramo, fanopol, fmespol, cplan, cproductor, ctenedor, casegurado, cbeneficiario, istatpol, iestado, cgestor, csucur).\n' +
      '- Orden por `cnpoliza`; `page` por defecto 1 y `steps` por defecto 100.\n\n' +
      '**Equivale a** `POST /api/v1/poliza/searchPolizaOnly` de SysIP-backend.',
  })
  @ApiBody({
    type: PolizaOnlyRequestDoc,
    examples: { porNumero: { summary: 'Una póliza', value: { cnpoliza: '18-1-0130480661', page: 1, steps: 5 } } },
  })
  @ApiResponse({
    status: 200,
    description: 'Lista plana de pólizas y total.',
    schema: {
      example: {
        status: true,
        data: {
          list: [
            {
              cpoliza: 1800000000000170500,
              cnpoliza: '18-1-0130480661',
              cramo: 18,
              xramo: 'AUTOMOVIL',
              xintermediario: 'PEREZ GOMEZ , MARIA ELENA',
              diff_vigencia: 365,
              xdocidentidad_asegurado: 'V-14484939',
              xasegurado: 'JUAN CARLOS RODRIGUEZ',
              xstatus: 'Vigente',
              fanopol: 2026,
              fmespol: 10,
              fdesde: '2026-10-07',
              fhasta: '2027-10-07',
              cplan: 'RCVBAS',
              Descripcion_Plan: 'Plan Básico RCV',
            },
          ],
          total: 1,
        },
      },
    },
  })
  @CoreError(500, 'Error de base de datos.', 'Mensaje del error SQL.')
  @CoreAuthErrors()
  async polizaOnly(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.searchPolizaOnly(body ?? {}));
  }

  @Post('poliza-recibos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detalle de la póliza: recibos, vehículo y coberturas reales',
    operationId: 'endososCorePolizaRecibos',
    description:
      'Devuelve la fila de `adpoliza` enriquecida. Es lo que Endosos usa para **conservar el casco** al ampliar un plan.\n\n' +
      '- **Clave en Parametrización:** `getPolicyDetails`.\n' +
      '- `recibosInfo.recibos[]`: recibos de esa póliza/año/mes con `iestadorec` (P pendiente, C cobrado, A anulado, N notificado). ' +
      'Las fechas salen `YYYY-MM-DD`.\n' +
      '- Con `cramo = 18` añade `contrato` (certificado del vehículo), `vehicle` (placa, marca, modelo, año, valor) y ' +
      '`coberturasReal[]` (cobertura, tasa, suma asegurada y prima, tomadas de la flota o de `adpolcob`).\n' +
      '- Los cuatro campos del body son obligatorios.\n\n' +
      '**Equivale a** `POST /api/v1/poliza/search-polizaRecibos` de SysIP-backend.',
  })
  @ApiBody({
    type: PolizaRecibosRequestDoc,
    examples: { auto: { summary: 'Póliza de automóvil', value: { cnpoliza: '18-1-0130480661', cramo: 18, fanopol: 2026, fmespol: 10 } } },
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la póliza.',
    schema: {
      example: {
        status: true,
        message: 'Recibos Encontrados.',
        recibosInfo: {
          cnpoliza: '18-1-0130480661',
          cramo: 18,
          xramo: 'AUTOMOVIL',
          cplan: 'RCVBAS',
          istatpol: 'V',
          fanopol: 2026,
          fmespol: 10,
          cproductor: 215,
          ifrecuencia: 'A',
          contrato: {
            xplaca: 'AB123CD',
            cmarca: '001',
            cmodelo: '015',
            cversion: '08',
            cano: 2022,
            mvalor: 55314,
            xmarca: 'TOYOTA',
            xmodelo: 'COROLLA',
            xversion: 'XEI',
            xvehiculo: 'TOYOTA COROLLA XEI',
          },
          vehicle: {
            placa: 'AB123CD',
            marca: '074',
            modelo: '001',
            version: '01',
            xvehiculo: 'TOYOTA COROLLA XEI',
            anio: 2020,
            mvalor: 15000,
            cplan: 'RCVBAS',
          },
          coberturasReal: [
            { ccobertura: 7, xcobertura: 'DAÑOS A COSAS', ptasa: 2.19, msumaasegurada: 2000, mprima: 43.93 },
            { ccobertura: 15, xcobertura: 'CLUB ARYS', ptasa: 0, msumaasegurada: 0, mprima: 0 },
          ],
          recibos: [
            {
              cnrecibo: '18-100282790',
              iestadorec: 'P',
              mmontorecext: 16.25,
              mmontorec: 14200.5,
              ptasamon: 873.867,
              cmoneda: '$',
              fdesde: '2026-10-07',
              fhasta: '2027-10-07',
              selected: false,
            },
          ],
        },
      },
    },
  })
  @CoreError(400, 'Falta cnpoliza, cramo, fanopol o fmespol.', 'cnpoliza, cramo, fanopol y fmespol son requeridos.')
  @CoreError(404, 'La póliza no existe para ese año/mes.', 'No se encontró la póliza.')
  @CoreError(500, 'Certificado o recibos incompletos, o error SQL.', 'No se encontro datos de los recibos de la poliza')
  @CoreAuthErrors()
  async polizaRecibos(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.searchRecibosFromPoliza(body ?? {}));
  }

  @Post('plan-coberturas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Coberturas de un plan',
    operationId: 'endososCorePlanCoberturas',
    description:
      'Lista las coberturas que componen un plan (`maplancob` + `macoberturas`). Endosos las compara contra las del ' +
      'plan actual en el paso de catálogo.\n\n' +
      '- **Clave en Parametrización:** `planCoverages`.\n' +
      '- Un plan inexistente devuelve `data: []`.\n\n' +
      '**Equivale a** `POST /api/v1/poliza/plan-coberturas` de SysIP-backend.',
  })
  @ApiBody({
    type: PlanCoberturasRequestDoc,
    examples: { rcv: { summary: 'Plan RCV básico', value: { cplan: 'RCVBAS', cramo: 18 } } },
  })
  @ApiResponse({
    status: 200,
    description: 'Coberturas del plan.',
    schema: {
      example: {
        status: true,
        message: 'Coberturas del plan encontradas.',
        data: [
          { ccobertura: 6, xcobertura: 'DAÑOS A PERSONAS' },
          { ccobertura: 7, xcobertura: 'DAÑOS A COSAS' },
          { ccobertura: 15, xcobertura: 'CLUB ARYS' },
        ],
      },
    },
  })
  @CoreError(500, 'Error de base de datos.', 'Mensaje del error SQL.')
  @CoreAuthErrors()
  async planCoberturas(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.getPlanCoverages(body ?? {}));
  }

  // ───────────────────────────── Cálculo ──────────────────────────────────────

  @Post('calcular-plan-sis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prima del plan calculada como Sis2000',
    operationId: 'endososCoreCalcularPlanSis',
    description:
      'Ejecuta `sp_calculo_auto_nexus` (a través de Valrep) para un vehículo y un plan: prima por cobertura y totales. Es la **fuente de verdad de la prima** ' +
      'del plan destino al ampliar un plan.\n\n' +
      '- **Clave en Parametrización:** `calculatePlan`.\n' +
      '- **Obligatorios:** `cmarca`, `cmodelo`, `cversion`, `cano`, `idPlan`, `suma`, `fdesde`, `fhasta`, `tipo`, `uso`, `puestos`. ' +
      'Si falta alguno responde **400** listándolos.\n' +
      '- `coberAdicional`: `RC` solo RCV (por defecto), `CA` / `PT` / `PP` añaden casco. El usuario de cálculo lo fija el Core (no el body).\n' +
      '- `mount[]` es el detalle por cobertura; `pa`, `ca`, `pt`, `pp`, `ap` son los totales (RCV, amplia, pérdida total, parcial y aditamentos) ' +
      'y `boolCA`/`boolPT`/`boolPP`/`boolBl`/`boolAd` indican qué coberturas aplican.\n\n' +
      '**Equivale a** `POST /api/v1/emissions/calculatePlanSis` de SysIP-backend.',
  })
  @ApiBody({
    type: CalcularPlanRequestDoc,
    examples: {
      soloRcv: {
        summary: 'Solo RCV',
        value: {
          cmarca: '001', cmodelo: '015', cversion: '08', cano: 2022, idPlan: 'Auto', suma: 15000,
          fdesde: '2026-10-09', fhasta: '2027-10-09', uso: 2, cramo: 18, coberAdicional: 'RC',
        },
      },
      conCasco: {
        summary: 'Con Cobertura Amplia',
        value: {
          cmarca: '001', cmodelo: '015', cversion: '08', cano: 2022, idPlan: 'Auto', suma: 15000,
          fdesde: '2026-10-09', fhasta: '2027-10-09', uso: 2, cramo: 18, coberAdicional: 'CA',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Cálculo exitoso.',
    schema: {
      example: {
        message: 'Calculo generado con exito',
        status: true,
        mount: [
          {
            cplan: 'Auto', xplan: 'Auto', cproducto: 'ALT', ccobertura: '7', xdescripcion_l: 'DAÑOS A COSAS',
            cmoneda: '$', prima: 43.93, masegurada: 2000, tasaCA: 0, tasaPT: 0, tasaPP: 0,
          },
        ],
        pa: 108.609, ca: 0, pt: 0, ap: 0, pp: 0,
        boolPT: false, boolPP: false, boolCA: false, boolBl: false, boolAd: false,
        cproducto: 'ALT',
      },
    },
  })
  @CoreError(
    400,
    'Faltan campos obligatorios, vehículo no encontrado en el catálogo INMA o plan/parámetros inválidos (el mensaje lo indica).',
    'Faltan campos requeridos para calcular: cmarca, cmodelo, cversion, cano, idPlan, fdesde, fhasta, uso.',
  )
  @CoreError(500, 'Error inesperado del procedimiento o de base de datos.', 'Mensaje del error SQL.')
  @CoreAuthErrors()
  async calcularPlanSis(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.calculatePlanSis(body ?? {}));
  }

  @Post('planes-solicitud')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Planes con coberturas y tasas para una solicitud',
    operationId: 'endososCorePlanesSolicitud',
    description:
      'Mismo cálculo (`sp_calculo_auto_nexus`) y mismos campos obligatorios que `calcular-plan-sis`, pero la respuesta viene **agrupada por plan**, con las ' +
      'tasas de casco (`TCA`, `TPT`, `TPP`) y las coberturas de cada plan. Endosos lo usa para armar las tarjetas de CA/PT/PP.\n\n' +
      '- **Clave en Parametrización:** `planesSolicitud`.\n' +
      '- Las primas totales (`PA`, `CA`, `PT`, `PP`) vienen como texto con 2 decimales.\n\n' +
      '**Equivale a** `POST /api/v1/emissions/planesSolicitud` de SysIP-backend.',
  })
  @ApiBody({
    type: CalcularPlanRequestDoc,
    examples: {
      cotizacion: {
        summary: 'Cotización RCV + casco',
        value: {
          cmarca: '001', cmodelo: '015', cversion: '08', cano: 2022, idPlan: 'Auto', suma: 15000,
          fdesde: '2026-10-09', fhasta: '2027-10-09', uso: 2, cramo: 18, coberAdicional: 'CA',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Planes calculados.',
    schema: {
      example: {
        message: 'Calculo generado con exito',
        status: true,
        planes: [
          {
            cplan: 'Auto',
            xplan: 'Auto',
            tipoPlan: 'ALT',
            PT: '0.00', CA: '0.00', PA: '108.61', PP: '0.00',
            TCA: 2.4, TPT: 1.2, TPP: 0.8,
            boolPT: false, boolCA: false, boolPP: false, boolBl: false, boolAd: false,
            coberturas: [
              { ccobertura: '7', xdescripcion_l: 'DAÑOS A COSAS', cmoneda: '$', prima: 43.93, masegurada: 2000 },
            ],
          },
        ],
      },
    },
  })
  @CoreError(
    400,
    'Faltan campos obligatorios, vehículo no encontrado en el catálogo INMA o plan/parámetros inválidos (el mensaje lo indica).',
    'Faltan campos requeridos para calcular: cmarca, cmodelo, cversion, cano, idPlan, suma, fdesde, fhasta, tipo, uso, puestos.',
  )
  @CoreError(500, 'Error inesperado del procedimiento o de base de datos.', 'Mensaje del error SQL.')
  @CoreAuthErrors()
  async planesSolicitud(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.calculatePlanSolicitud(body ?? {}));
  }

  // ───────────────────────────── Escritura ────────────────────────────────────

  @Post('anular-recibos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular recibos pendientes por número',
    operationId: 'endososCoreAnularRecibos',
    description:
      '⚠️ **Escribe en Sis2000.** Anula los recibos indicados antes de crear el recibo del endoso.\n\n' +
      '- **Clave en Parametrización:** `voidReceipts`.\n' +
      '- **Qué hace** (todo en una sola transacción; si algo falla se revierte): marca el recibo como anulado (`adrecibos`), ' +
      'desactiva su cobertura (`adpolcob`) y, si es de un contrato de flota, anula el recibo del contrato (`SURECIBO`). ' +
      'Deja la operación en `auoperaciones` (`I` → `F`, o `E` si falla).\n' +
      '- Un número de recibo inexistente **no genera error**: simplemente no se actualiza nada.\n' +
      '- No incluir recibos **cobrados**.\n\n' +
      '**Equivale a** `POST /api/v1/changes/anularRecibos` de SysIP-backend.',
  })
  @ApiBody({
    type: AnularRecibosCoreRequestDoc,
    examples: {
      pendientes: {
        summary: 'Dos recibos pendientes',
        value: { cnpoliza: '18-1-0130480661', recibos: ['18-100282790', '18-100282791'], fanulacion: '2026-10-09', cusuario: 1422 },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Recibos anulados.',
    schema: {
      example: {
        status: true,
        data: {
          message: 'Anulacion Exitosa',
          body: { cnpoliza: '18-1-0130480661', recibos: ['18-100282790', '18-100282791'], fanulacion: '2026-10-09', cusuario: 1422 },
        },
      },
    },
  })
  @CoreError(400, 'Falta `recibos` o la fecha es inválida.', 'recibos es requerido (lista de cnrecibo).')
  @CoreError(500, 'Error de base de datos (se revirtió la transacción).', 'Mensaje del error SQL.')
  @CoreAuthErrors()
  async anularRecibos(@Body() body: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.core.anularRecibos(body ?? {}));
  }
}
