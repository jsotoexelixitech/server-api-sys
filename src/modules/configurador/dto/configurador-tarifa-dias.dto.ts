import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Fila de maplantar_dias (sin cramo/cplan/ccober/ctarifa, que van en la ruta). */
export class FilaDiasDto {
  @ApiProperty({ example: 1, description: 'Tarifa binacional del vehículo (maanomod.ctarifabi o BINAC_PARAM).' })
  @Type(() => Number) @IsInt() @Min(0) ctarifabi: number;
  @ApiProperty({ example: 4, description: 'Número de tramo (parte de la llave).' })
  @Type(() => Number) @IsInt() @Min(0) qdias: number;
  @ApiProperty({ example: true }) @IsBoolean() bnacional: boolean;
  @ApiPropertyOptional({ example: '$' }) @IsOptional() @Transform(recortar) @IsString() @MaxLength(3) cmoneda?: string | null;
  @ApiProperty({ example: 15 }) @Type(() => Number) @IsInt() @Min(0) @Max(9999) ndias_min: number;
  @ApiProperty({ example: 30, description: '30 = fila anual (el SP la usa con vigencia de 12 meses).' })
  @Type(() => Number) @IsInt() @Min(0) @Max(9999) ndias_max: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) msuma?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) mprima?: number | null;
  @ApiPropertyOptional({ description: 'Prima anual (fila con ndias_max 30).' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) mprima_anual?: number | null;
  @ApiPropertyOptional({ description: 'Prima por día adicional.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) mprima_dia?: number | null;
}

/** Reemplazo de las filas 'V' de una cobertura y tarifa del plan en maplantar_dias. Lista vacía = inactivar todas. */
export class TarifaDiasDto {
  @ApiProperty({ type: [FilaDiasDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilaDiasDto)
  filas: FilaDiasDto[];
}
