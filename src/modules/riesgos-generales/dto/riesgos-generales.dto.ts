import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString,
  Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { ORIGENES_COTIZADOR, type OrigenCotizador } from '../riesgos-generales.calculo';

/**
 * Ramos con tarifa por cobertura en matarifa_d: 16 = Combinado Empresarial, 25 = Riesgos Especiales,
 * 38 = Combinado Residencial.
 */
export const RAMOS_COBERTURAS = [16, 25, 38] as const;

/** Ramos que aceptan el bloque `biomasa`. */
export const RAMOS_BIOMASA = [25] as const;

/** Horizontes contractuales de engorde (condicionado 2.14). */
export const HORIZONTES_BIOMASA = [6, 12, 18, 24] as const;

export class TarifaPlanDto {
  @ApiProperty({ example: 38 })
  @Type(() => Number)
  @IsIn(RAMOS_COBERTURAS as unknown as number[])
  cramo: number;

  @ApiProperty({ example: '2' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  cplan: string;
}

/** Coberturas del ramo con tarifa vigente: cualquier ramo (solo lectura); RAMOS_COBERTURAS no aplica aquí. */
export class CoberturasRamoDto {
  @ApiProperty({ example: 38, description: 'Código del ramo (cualquier ramo; consulta de solo lectura).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cramo: number;
}

export class CoberturaPedidaDto {
  @ApiProperty({ example: '1', description: 'Código de cobertura (macoberturas.ccobertura).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccober: string;

  @ApiPropertyOptional({
    example: '1',
    description: 'Modo combo: tarifa de la cobertura (matarifa.ctarifa). Solo hace falta si la cobertura tiene varias tarifas vigentes en el ramo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  ctarifa?: string;

  @ApiPropertyOptional({
    example: 140000,
    description: 'Suma asegurada de la cobertura en la moneda del plan. Obligatoria si no se envía `calculo`; con `calculo` se ignora.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  suma?: number;

  @ApiPropertyOptional({
    example: 350.5,
    description: 'Solo `modo: cotizador`: prima anual de la cobertura que fijó el cotizador o Técnico (≥ 0, en la moneda de la cobertura). '
      + 'En los demás modos se ignora: la prima la calcula nest-api.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  prima?: number;
}

/** Cálculo genérico de la suma asegurada: unidades × valor_unidad, aplicado a todas las coberturas pedidas. */
export class CalculoSumaDto {
  @ApiProperty({ example: 20000, description: 'Cantidad de unidades (hasta 4 decimales).' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  unidades: number;

  @ApiProperty({ example: 2.5, description: 'Valor por unidad en la moneda del plan (hasta 2 decimales).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor_unidad: number;
}

/** Dato libre del bien: se imprime como "etiqueta: valor" en xdescrip3 y xdescrip4. */
export class DatoBienDto {
  @ApiProperty({ example: 'Serial del equipo' })
  @IsString()
  @Matches(/\S/, { message: 'etiqueta no puede estar vacía' })
  @MaxLength(60)
  etiqueta: string;

  @ApiProperty({ example: 'AB-1234' })
  @IsString()
  @Matches(/\S/, { message: 'valor no puede estar vacío' })
  @MaxLength(190)
  valor: string;
}

/** Lote para la proyección contractual de biomasa. B0 y PKC salen de `calculo` (unidades y valor_unidad). */
export class BiomasaDto {
  @ApiProperty({ example: 100, description: 'Cantidad de animales (Unidades Computables).' })
  @IsInt()
  @IsPositive()
  @Max(1000000)
  cantidad_animales: number;

  @ApiProperty({ example: 200, description: 'Peso promedio inicial certificado en kg; debe coincidir con B0 / animales.' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  peso_promedio: number;

  @ApiProperty({ example: '2026-11-05', description: 'Fecha de certificación inicial (YYYY-MM-DD).' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha_inicio debe tener el formato YYYY-MM-DD' })
  @IsDateString({ strict: true })
  fecha_inicio: string;

  @ApiProperty({ example: 6, enum: HORIZONTES_BIOMASA, description: 'Horizonte Contractual de Engorde en meses.' })
  @IsIn(HORIZONTES_BIOMASA as unknown as number[])
  horizonte_meses: number;

  @ApiPropertyOptional({
    example: 'LT-2026-001',
    description: 'Lote Ganadero Certificado. Obligatorio al emitir y único entre pólizas vigentes del ramo. Sin punto y coma; se guarda en mayúsculas.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[^;]*$/, { message: 'lote no puede contener punto y coma' })
  lote?: string;

  @ApiPropertyOptional({ example: '0,92', description: 'Índice de Homogeneidad del Lote, como lo entrega la certificadora. Obligatorio al emitir.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ihl?: string;
}

/**
 * Modo de tarifa: `plan` = coberturas del plan (maplantar); `combo` = coberturas del ramo, el plan es solo contenedor;
 * `cotizador` = coberturas del ramo con la prima que fijó el cotizador RC o Técnico (solo emisión y protegido).
 */
export const MODOS_TARIFA = ['plan', 'combo', 'cotizador'] as const;
export type ModoTarifa = (typeof MODOS_TARIFA)[number];

/**
 * Campos comunes de cotizar y emitir, sin el ramo: cada DTO valida `cramo` a su manera (cotizar: RAMOS_COBERTURAS;
 * emitir: cualquier entero y el servicio aplica RIESGOS_GENERALES_RAMOS_EMISION).
 */
export abstract class CoberturasCamposDto {
  @ApiProperty({ example: '2', description: 'Plan vigente del ramo. En modo combo es el contenedor: aporta moneda, plan y la regla de duplicados.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  cplan: string;

  @ApiPropertyOptional({
    enum: MODOS_TARIFA,
    default: 'plan',
    description: '`plan` (por defecto): coberturas y tasas del plan (maplantar). `combo`: cualquier cobertura del ramo con tarifa vigente '
      + '(GET coberturas); prima = suma × pprima / 100 o la prima fija de matarifa_d si no hay tasa. `cotizador` (solo emisión): '
      + 'coberturas del ramo con su `prima` informada, sin recalcular; requiere RIESGOS_GENERALES_EMISION_COTIZADOR=true y el scope '
      + '`emissions:riesgos-generales-prima`.',
  })
  @IsOptional()
  @IsIn(MODOS_TARIFA as unknown as string[])
  modo?: ModoTarifa;

  @ApiProperty({
    type: [CoberturaPedidaDto],
    description: 'Coberturas elegidas con su suma (o sin suma si se envía `calculo`). La básica es obligatoria.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CoberturaPedidaDto)
  coberturas: CoberturaPedidaDto[];

  @ApiPropertyOptional({
    type: CalculoSumaDto,
    description: 'Suma calculada = unidades × valor_unidad para todas las coberturas pedidas (ignora `suma`).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CalculoSumaDto)
  calculo?: CalculoSumaDto;

  @ApiPropertyOptional({
    type: [DatoBienDto],
    description: 'Datos del bien para la póliza (xdescrip3 y xdescrip4, 250 caracteres cada uno). Lo que no cabe se informa en `datos_bien.omitidos`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DatoBienDto)
  datos_bien?: DatoBienDto[];

  @ApiPropertyOptional({
    type: BiomasaDto,
    description: 'Ramo 25: proyecta la curva contractual y agrega los datos del lote antes de `datos_bien`. Requiere `calculo` con B0 y PKC.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BiomasaDto)
  biomasa?: BiomasaDto;
}

/** Cotizar o emitir: campos comunes con el ramo. */
export type CoberturasBaseDto = CoberturasCamposDto & { cramo: number };

/** Cotizar: solo los ramos con tarifa por cobertura (RAMOS_COBERTURAS). */
export class CotizarCoberturasDto extends CoberturasCamposDto {
  @ApiProperty({ example: 38, enum: RAMOS_COBERTURAS })
  @Type(() => Number)
  @IsIn(RAMOS_COBERTURAS as unknown as number[])
  cramo: number;
}

/** Ramos donde el SP exige número de unidad o apartamento. */
const RAMOS_UNIDAD_DTO = [28, 38];

export class PersonaRiesgoDto {
  @ApiProperty({ example: 'V' }) @IsString() @MaxLength(1) tipo_cedula: string;
  @ApiProperty({ example: '12345678' }) @IsNotEmpty() rif: string | number;
  @ApiProperty({ example: 'JUAN' }) @IsString() @IsNotEmpty() nombre: string;
  @ApiPropertyOptional({ example: 'PEREZ' }) @IsOptional() @IsString() apellido?: string;
  @ApiPropertyOptional({ example: 'Caracas' }) @IsOptional() @IsString() direccion?: string;
  @ApiPropertyOptional({ example: '04121234567' }) @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional({ example: 'juan@correo.com' }) @IsOptional() @IsString() correo?: string;
}

/**
 * Emitir: cualquier cramo en el DTO; el servicio lo valida contra RIESGOS_GENERALES_RAMOS_EMISION (por defecto 16, 25 y 38).
 */
export class EmitirCoberturasDto extends CoberturasCamposDto {
  @ApiProperty({ example: 38, description: 'Ramo; debe estar habilitado en RIESGOS_GENERALES_RAMOS_EMISION (por defecto 16, 25 y 38).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cramo: number;

  @ApiProperty({ type: PersonaRiesgoDto })
  @ValidateNested()
  @Type(() => PersonaRiesgoDto)
  tomador: PersonaRiesgoDto;

  @ApiPropertyOptional({ type: PersonaRiesgoDto, description: 'Sin asegurado se usa el tomador.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PersonaRiesgoDto)
  asegurado?: PersonaRiesgoDto;

  @ApiProperty({ example: 'Apartamento 5-B, Residencias Los Palos Grandes', description: 'Bien o actividad asegurada (xdescrip1).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  bien: string;

  @ApiProperty({ example: 'Av. Andrés Bello, Los Palos Grandes, Caracas', description: 'Dirección del riesgo.' })
  @IsString()
  @IsNotEmpty()
  direccion_riesgo: string;

  @ApiPropertyOptional({
    example: 52,
    description: 'Ramos 28 y 38 (obligatorio): número de apartamento o unidad; Sis2000 no deja dos pólizas vigentes con el mismo asegurado, plan y unidad.',
  })
  @ValidateIf((o: EmitirCoberturasDto) => o.apartamento != null || RAMOS_UNIDAD_DTO.includes(Number(o.cramo)))
  @Type(() => Number)
  @IsInt({ message: 'En los ramos 28 y 38 el número de apartamento o unidad es obligatorio (entero mayor a 0).' })
  @Min(1, { message: 'En los ramos 28 y 38 el número de apartamento o unidad es obligatorio (entero mayor a 0).' })
  apartamento?: number;

  @ApiPropertyOptional({ example: 80080 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productor?: number;

  @ApiPropertyOptional({ example: 6, description: 'Meses de vigencia (1 a 60); fhasta = fdesde + meses. Sin enviar: 1 año.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  meses?: number;

  @ApiPropertyOptional({
    example: 1234.56,
    description: 'Obligatorio con `modo: cotizador`: prima total anual (> 0); debe ser igual a la suma de las primas por cobertura (tolerancia de redondeo).',
  })
  @ValidateIf((o: EmitirCoberturasDto) => o.modo === 'cotizador' || o.prima_total != null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  prima_total?: number;

  @ApiPropertyOptional({ enum: ORIGENES_COTIZADOR, description: 'Obligatorio con `modo: cotizador`: cotización de origen (RCG, RCP, RCE o combo).' })
  @ValidateIf((o: EmitirCoberturasDto) => o.modo === 'cotizador' || o.cotizador != null)
  @IsIn(ORIGENES_COTIZADOR as unknown as string[])
  cotizador?: OrigenCotizador;

  @ApiPropertyOptional({ example: 'RCG-2026-P123456', description: 'Obligatorio con `modo: cotizador`: número de la cotización; se graba en los datos del bien.' })
  @ValidateIf((o: EmitirCoberturasDto) => o.modo === 'cotizador' || o.ncotizacion != null)
  @IsString()
  @Matches(/\S/, { message: 'ncotizacion no puede estar vacío' })
  @MaxLength(40)
  ncotizacion?: string;
}
