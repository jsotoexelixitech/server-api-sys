import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const mayuscula = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const texto = ({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value);

/** Cabecera del plan (versión vigente: fdesde_plan máxima). Solo los campos enviados. */
export class CabeceraPlanDto {
  @ApiPropertyOptional({ example: 'PLAN BÁSICO', description: 'Nombre (máx. 60); también actualiza xplan_c (25).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(60)
  xplan?: string;

  @ApiPropertyOptional({ example: '$', description: 'Moneda (mamonedas.cmoneda).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(4)
  cmoneda?: string;

  @ApiPropertyOptional({ example: 'PRB01', description: 'Producto (maproductos); aviso si tiene más de 6 caracteres o es de otro ramo.' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(10)
  cproducto?: string;

  @ApiPropertyOptional({ enum: ['V', 'I'] })
  @IsOptional()
  @Transform(mayuscula)
  @IsIn(['V', 'I'])
  iestado?: 'V' | 'I';
}

/** Montos de la tarifa del plan en maplantar. La prima y la tasa son excluyentes. */
export class TarifaPlanDto {
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  msumamin?: number;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  msumamax?: number;

  @ApiPropertyOptional({ example: 25, description: 'Prima fija. Si es > 0, pprima pasa a 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mprima?: number;

  @ApiPropertyOptional({ example: 1.5, description: 'Tasa (%). Si es > 0, mprima pasa a 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  pprima?: number;
}

/** Alta de una cobertura en un plan de patrimonial o auto (maplancob + maplantar de la versión vigente). */
export class CoberturaPlanDto extends TarifaPlanDto {
  @ApiProperty({ example: '1', description: 'Cobertura del ramo (macoberturas).' })
  @Transform(texto)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccobertura: string;

  @ApiProperty({ example: '1', description: "Tarifa 'V' de la cobertura (matarifa)." })
  @Transform(texto)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ctarifa: string;

  @ApiPropertyOptional({ description: 'En patrimonial y auto la obligatoriedad es de la tarifa (matarifa.bobligatoria, por ramo): aquí solo se compara y se avisa.' })
  @IsOptional()
  @IsBoolean()
  bobligatoria?: boolean;
}

export class ParentescoTarifaDto {
  @ApiProperty({ example: 1, description: 'Parentesco (maparent.cparentesco).' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cparen: number;

  @ApiProperty({ example: 'C003', description: 'Tabla de tasas por edad (mapltabedad_d).' })
  @Transform(texto)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  ctablatar: string;

  @ApiPropertyOptional({ enum: ['A', 'M', 'F'], default: 'A', description: 'Sexo (A = ambos).' })
  @IsOptional()
  @Transform(mayuscula)
  @IsIn(['A', 'M', 'F'])
  csexo?: string;
}

/** Alta de una cobertura en un plan de personas (maplcober_per + mapltarifas_per de la versión vigente). */
export class CoberturaPersonasDto {
  @ApiProperty({ example: '1' })
  @Transform(texto)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccobertura: string;

  @ApiProperty({ example: '1' })
  @Transform(texto)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ctarifa: string;

  @ApiPropertyOptional({ default: true, description: 'maplcober_per.bobligatoria (por defecto true, como el alta de planes).' })
  @IsOptional()
  @IsBoolean()
  bobligatoria?: boolean;

  @ApiProperty({ type: [ParentescoTarifaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ParentescoTarifaDto)
  parentescos: ParentescoTarifaDto[];
}
