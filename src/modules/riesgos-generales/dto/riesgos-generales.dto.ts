import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

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
    example: 140000,
    description: 'Suma asegurada de la cobertura en la moneda del plan. Obligatoria si no se envía `calculo`; con `calculo` se ignora.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  suma?: number;
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

  @ApiPropertyOptional({ example: 'LT-2026-001', description: 'Lote Ganadero Certificado. Obligatorio al emitir.' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  lote?: string;

  @ApiPropertyOptional({ example: '0,92', description: 'Índice de Homogeneidad del Lote, como lo entrega la certificadora. Obligatorio al emitir.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ihl?: string;
}

export class CotizarCoberturasDto extends TarifaPlanDto {
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

export class PersonaRiesgoDto {
  @ApiProperty({ example: 'V' }) @IsString() @MaxLength(1) tipo_cedula: string;
  @ApiProperty({ example: '12345678' }) @IsNotEmpty() rif: string | number;
  @ApiProperty({ example: 'JUAN' }) @IsString() @IsNotEmpty() nombre: string;
  @ApiPropertyOptional({ example: 'PEREZ' }) @IsOptional() @IsString() apellido?: string;
  @ApiPropertyOptional({ example: 'Caracas' }) @IsOptional() @IsString() direccion?: string;
  @ApiPropertyOptional({ example: '04121234567' }) @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional({ example: 'juan@correo.com' }) @IsOptional() @IsString() correo?: string;
}

export class EmitirCoberturasDto extends CotizarCoberturasDto {
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

  @ApiPropertyOptional({ example: 52, description: 'Ramo 38: número de apartamento o unidad (clave cédula + plan + unidad).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
}
