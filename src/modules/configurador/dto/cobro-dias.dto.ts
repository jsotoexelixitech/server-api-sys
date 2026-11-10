import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { COBRO_DIAS_MAX } from '../configurador.cobro-dias';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class PrimaDiariaDto {
  @ApiProperty({ example: '1', description: 'Cobertura del plan (maplantar.ccober / maplcober_per.ccobertura).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccober: string;

  @ApiProperty({ example: 1.25, description: 'Prima por día en la moneda del plan (> 0, hasta 6 decimales).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  prima_diaria: number;
}

/** PUT v1/configurador/planes/:cramo/:cplan/cobro-dias */
export class CobroDiasPlanDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  activo: boolean;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dias_min: number;

  @ApiProperty({ example: 30, maximum: COBRO_DIAS_MAX, description: 'Mayor o igual a dias_min.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COBRO_DIAS_MAX)
  dias_max: number;

  @ApiPropertyOptional({ example: '$' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  cmoneda?: string;

  @ApiProperty({ type: [PrimaDiariaDto], description: 'Al menos una si activo = true. Sin coberturas repetidas.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrimaDiariaDto)
  primas: PrimaDiariaDto[];
}

/** POST v1/configurador/planes/:cramo/:cplan/cobro-dias/cotizar: fdesde + fhasta, o dias. */
export class CotizarCobroDiasDto {
  @ApiPropertyOptional({ example: '2026-11-10' })
  @IsOptional()
  @Matches(FECHA, { message: 'fdesde debe tener el formato AAAA-MM-DD.' })
  fdesde?: string;

  @ApiPropertyOptional({ example: '2026-11-16' })
  @IsOptional()
  @Matches(FECHA, { message: 'fhasta debe tener el formato AAAA-MM-DD.' })
  fhasta?: string;

  @ApiPropertyOptional({ example: 7, description: 'Alternativa a fdesde/fhasta.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dias?: number;
}
