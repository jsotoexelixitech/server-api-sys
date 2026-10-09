import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTOs SOLO PARA DOCUMENTACIÓN (Swagger) de `/api/endosos/core/*`.
 *
 * Los handlers reciben `Record<string, any>` a propósito: el ValidationPipe global usa
 * `whitelist: true` y descartaría campos que el backend de Endosos envía fuera de estos DTOs.
 */

export class PoliciesInfoRequestDoc {
  @ApiPropertyOptional({ example: 1, description: 'Página (base 1). Si se envía junto con `steps`, la respuesta se pagina.' })
  page?: number;

  @ApiPropertyOptional({ example: 50, description: 'Registros por página. Alias aceptado: `limit`.' })
  steps?: number;

  @ApiPropertyOptional({ example: 215, description: 'Código del productor/corredor (`adpoliza.cproductor`).' })
  ccorredor?: number;

  @ApiPropertyOptional({ example: 18, description: 'Código del ramo (18 = Automóvil).' })
  cramo?: number;

  @ApiPropertyOptional({ example: 'RCVBAS', description: 'Código exacto del plan.' })
  cplan?: string;

  @ApiPropertyOptional({ example: 14484939, description: 'Cédula/RIF del asegurado, solo dígitos.' })
  casegurado?: number;

  @ApiPropertyOptional({ example: '18-1-0130480661', description: 'Número de póliza (búsqueda parcial: contiene).' })
  cnpoliza?: string;

  @ApiPropertyOptional({ example: true, description: 'Incluye `recibos[]` de cada póliza.' })
  includeReceipts?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Incluye `coberturasReal[]` y calcula `sumaAsegurada`.' })
  includeCoverages?: boolean;
}

export class PolizaSearchRequestDoc {
  @ApiPropertyOptional({
    example: '18-1-0130480661',
    description: 'Número exacto de póliza. Tiene prioridad sobre el resto de filtros.',
  })
  cnpoliza?: string;

  @ApiPropertyOptional({
    example: '215-0-0',
    description: 'Gestor (`adpoliza.cgestor`). Se busca por prefijo, sin los sufijos `-0`. Se ignora si es `<ccorredor>-0-0`.',
  })
  cgestor?: string;

  @ApiPropertyOptional({ example: '215', description: 'Productor/corredor. Se usa si no llegan `cnpoliza` ni `cgestor`.' })
  ccorredor?: string;

  @ApiPropertyOptional({
    example: 'V-14484939',
    description: 'Cédula/RIF del asegurado. Se limpian guiones, puntos y la letra inicial (V/E).',
  })
  casegurado?: string;

  @ApiPropertyOptional({ example: 18, description: 'Filtra por ramo (se combina con cualquiera de los anteriores).' })
  cramo?: number;

  @ApiPropertyOptional({ example: 1, description: 'Página (base 1). Requiere `steps`.' })
  page?: number;

  @ApiPropertyOptional({ example: 50, description: 'Registros por página. Sin `page`/`steps` ni filtros devuelve máximo 500.' })
  steps?: number;
}

export class PolizaOnlyRequestDoc {
  @ApiPropertyOptional({
    example: '18-1-0130480661',
    description:
      'Filtros de igualdad sobre `adpoliza`. Columnas admitidas: cnpoliza, cpoliza, cramo, fanopol, fmespol, cplan, ' +
      'cproductor, ctenedor, casegurado, cbeneficiario, istatpol, iestado, cgestor, csucur. Otras claves se ignoran.',
  })
  cnpoliza?: string;

  @ApiPropertyOptional({ example: 1, description: 'Página (base 1). Por defecto 1.' })
  page?: number;

  @ApiPropertyOptional({ example: 50, description: 'Registros por página. Por defecto 100.' })
  steps?: number;
}

export class PolizaRecibosRequestDoc {
  @ApiProperty({ example: '18-1-0130480661', description: 'Número de póliza.' })
  cnpoliza: string;

  @ApiProperty({ example: 18, description: 'Código del ramo. Con 18 se añaden vehículo, contrato y coberturas reales.' })
  cramo: number;

  @ApiProperty({ example: 2026, description: 'Año de la póliza (`adpoliza.fanopol`).' })
  fanopol: number;

  @ApiProperty({ example: 10, description: 'Mes de la póliza (`adpoliza.fmespol`).' })
  fmespol: number;
}

export class PlanCoberturasRequestDoc {
  @ApiProperty({ example: 'RCVBAS', description: 'Código del plan (`maplanes.cplan`).' })
  cplan: string;

  @ApiPropertyOptional({ example: 18, default: 18, description: 'Código del ramo.' })
  cramo?: number;
}

export class CalcularPlanRequestDoc {
  @ApiProperty({ example: '074', description: 'Código de marca.' })
  cmarca: string;

  @ApiProperty({ example: '001', description: 'Código de modelo.' })
  cmodelo: string;

  @ApiProperty({ example: '01', description: 'Código de versión.' })
  cversion: string;

  @ApiProperty({ example: 2020, description: 'Año del vehículo.' })
  cano: number;

  @ApiProperty({ example: 'Auto', description: 'Plan a calcular (`cplan`). Para CA/PT/PP use un plan Auto*.' })
  idPlan: string;

  @ApiProperty({ example: 15000, description: 'Suma asegurada del casco (valor del vehículo) en USD.' })
  suma: number;

  @ApiProperty({ example: '2026-10-09', description: 'Inicio de vigencia (YYYY-MM-DD).' })
  fdesde: string;

  @ApiProperty({ example: '2027-10-09', description: 'Fin de vigencia (YYYY-MM-DD).' })
  fhasta: string;

  @ApiProperty({ example: 1, description: 'Tipo de vehículo (`ctipo`).' })
  tipo: number;

  @ApiProperty({ example: 2, description: 'Uso del vehículo (`cuso`).' })
  uso: number;

  @ApiProperty({ example: 5, description: 'Puestos.' })
  puestos: number;

  @ApiPropertyOptional({
    example: 'RC',
    default: 'RC',
    enum: ['RC', 'CA', 'PT', 'PP'],
    description: 'Casco a cotizar: RC = solo RCV, CA = Cobertura Amplia, PT = Pérdida Total, PP = Pérdida Parcial.',
  })
  coberAdicional?: string;

  @ApiPropertyOptional({ example: 18, default: 18, description: 'Ramo.' })
  cramo?: number;

  @ApiPropertyOptional({ example: 'N', default: 'N', description: 'Indicador de placa (S/N).' })
  iplaca?: string;

  @ApiPropertyOptional({ example: 0, description: 'Toneladas (vehículos de carga).' })
  toneladas?: number;

  @ApiPropertyOptional({ example: 0, description: 'Suma asegurada de blindaje.' })
  sumaAsegBl?: number;

  @ApiPropertyOptional({ example: 0, description: 'Suma asegurada de aditamentos.' })
  sumaAsegAd?: number;

  @ApiPropertyOptional({ example: 2.4, description: 'Tasa de Cobertura Amplia (%) para forzarla; vacío = tarifa.' })
  tasaCa?: number;

  @ApiPropertyOptional({ example: 1.2, description: 'Tasa de Pérdida Total (%).' })
  tasaPt?: number;

  @ApiPropertyOptional({ example: 0.8, description: 'Tasa de Pérdida Parcial (%).' })
  tasaPp?: number;

  @ApiPropertyOptional({ example: 0, description: 'Recargo sobre la prima.' })
  recargo?: number;

  @ApiPropertyOptional({ example: 0, description: 'Recargo de RCV.' })
  recargoRcv?: number;

  @ApiPropertyOptional({
    example: 1422,
    default: 7,
    description: 'Usuario que calcula (`cusuario`). Determina qué coberturas de casco puede tarifar.',
  })
  cusuario?: number;
}

export class AnularRecibosCoreRequestDoc {
  @ApiProperty({
    example: '18-1-0130480661',
    description: 'Póliza a la que pertenecen los recibos (queda en la bitácora `auoperaciones`).',
  })
  cnpoliza: string;

  @ApiProperty({
    example: ['18-100282790', '18-100282791'],
    type: [String],
    description: 'Números de recibo (`cnrecibo`) a anular. Los cobrados no deben incluirse.',
  })
  recibos: string[];

  @ApiPropertyOptional({ example: '2026-10-09', description: 'Fecha de anulación (YYYY-MM-DD). Por defecto, hoy.' })
  fanulacion?: string;

  @ApiPropertyOptional({ example: 1422, default: 1, description: 'Usuario operador.' })
  cusuario?: number;
}
