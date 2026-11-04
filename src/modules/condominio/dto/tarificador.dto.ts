import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** Ramos cuyo tarifario puede consultarse/editarse desde el tarificador de Técnica. */
export const TARIFICADOR_RAMOS = [16, 38] as const;

export class GetTarificadorDto {
  @ApiProperty({ example: 16, description: 'Ramo: 16 = Combinado Empresarial (Condominio), 38 = Combinado Residencial (Hogar).' })
  @Type(() => Number)
  @IsIn(TARIFICADOR_RAMOS as unknown as number[])
  cramo: number;

  @ApiPropertyOptional({ example: '1', description: 'Código de plan (opcional). Sin él se devuelven todos los planes vigentes.' })
  @IsOptional()
  @IsString()
  @MaxLength(6)
  cplan?: string;
}

/** Réplica de la tasa configurada en el tarificador hacia el tarifario del Core (matarifa_d). */
export class UpdateTarificadorTasaDto {
  @ApiProperty({ example: 16 })
  @Type(() => Number)
  @IsIn(TARIFICADOR_RAMOS as unknown as number[])
  cramo: number;

  @ApiProperty({ example: '26' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccober: string;

  @ApiProperty({ example: '1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ctarifa: string;

  @ApiProperty({ example: 0.15, description: 'Tasa en porcentaje (matarifa_d.pprima).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100)
  pprima: number;

  @ApiProperty({ example: 20364172, description: 'Código de usuario Sis2000 de quien modifica (auditoría cusuariomod).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cusuario: number;

  @ApiPropertyOptional({ example: 'Nombre Apellido', description: 'Nombre del usuario, solo para el log.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  xusuario?: string;
}

/** Frecuencias de pago que se pueden habilitar o deshabilitar por plan desde el panel de Técnica. */
export const FRECUENCIAS_CONFIGURABLES = ['A', 'S', 'T', 'M'] as const;

/** Habilita o deshabilita una frecuencia de pago de un plan (maplanes_frec.iestado: V = habilitada). */
export class UpdateTarificadorFrecuenciaDto {
  @ApiProperty({ example: 38 })
  @Type(() => Number)
  @IsIn(TARIFICADOR_RAMOS as unknown as number[])
  cramo: number;

  @ApiProperty({ example: '2', description: 'Código de plan vigente del ramo (maplanes.cplan).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  cplan: string;

  @ApiProperty({ example: 'T', enum: FRECUENCIAS_CONFIGURABLES as unknown as string[] })
  @IsIn(FRECUENCIAS_CONFIGURABLES as unknown as string[])
  ifrecuencia: string;

  @ApiProperty({ example: true, description: 'true = habilitada (iestado V); false = deshabilitada (iestado N).' })
  @IsBoolean()
  habilitada: boolean;

  @ApiProperty({ example: 20364172, description: 'Código de usuario Sis2000 de quien modifica (auditoría cusuariomod).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cusuario: number;

  @ApiPropertyOptional({ example: 'Nombre Apellido', description: 'Nombre del usuario, solo para el log.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  xusuario?: string;
}

export class TasaAntiguedadDto {
  @ApiProperty({ example: 'R', enum: ['R', 'C'] })
  @IsIn(['R', 'C'])
  iuso: string;

  @ApiProperty({ example: 1, description: '1 = 1967 o antes, 2 = 1968-1993, 3 = 1994-2018, 4 = 2019 en adelante.' })
  @Type(() => Number)
  @IsIn([1, 2, 3, 4])
  itramo: number;

  @ApiProperty({ example: 0.25125, description: 'Tasa global en porcentaje (incluye terremoto).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100)
  pprima: number;
}

export class RepartoCoberturaDto {
  @ApiProperty({ example: '1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccober: string;

  @ApiProperty({ example: '1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ctarifa: string;

  @ApiProperty({ example: 'P', enum: ['F', 'P'], description: 'F = parte fija de la tasa; P = porcentaje de lo que queda tras las partes fijas.' })
  @IsIn(['F', 'P'])
  itipo: string;

  @ApiProperty({ example: 80 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100)
  pvalor: number;
}

/** Tasas por antigüedad y reparto por cobertura de Condominio. Reemplaza la configuración completa. */
export class UpdateTarificadorAntiguedadDto {
  @ApiProperty({ example: 16, description: 'Solo Condominio (ramo 16).' })
  @Type(() => Number)
  @IsIn([16])
  cramo: number;

  @ApiProperty({ type: [TasaAntiguedadDto] })
  @IsArray()
  @ArrayMinSize(8)
  @ValidateNested({ each: true })
  @Type(() => TasaAntiguedadDto)
  tasas: TasaAntiguedadDto[];

  @ApiProperty({ type: [RepartoCoberturaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RepartoCoberturaDto)
  reparto: RepartoCoberturaDto[];

  @ApiProperty({ example: 20364172, description: 'Código de usuario Sis2000 de quien modifica (auditoría cusuariomod).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cusuario: number;

  @ApiPropertyOptional({ example: 'Nombre Apellido', description: 'Nombre del usuario, solo para el log.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  xusuario?: string;
}
