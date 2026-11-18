import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Fila de macattip (tipo y uso del ramo). Upsert: solo se escriben los campos enviados (null = vaciar la columna).
 * Si el par (ctipo, ccategotr) existe en otro ramo, la respuesta trae advertencias y solo se graba con confirmar: true.
 */
export class TipoUsoDto {
  @ApiPropertyOptional({ example: '7', description: 'Cobertura (macoberturas del ramo).' })
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(4) ccober?: string | null;
  @ApiPropertyOptional({ example: '1', description: 'Tarifa (matarifa del ramo y cobertura).' })
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(4) ctarifa?: string | null;

  @ApiPropertyOptional({ example: 25.5, description: 'Prima base RCV (moneda local).' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) mprimbas?: number | null;
  @ApiPropertyOptional({ example: 10 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) mprimext?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) msumacosas?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) msumapers?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) msumacosasext?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) msumapersext?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) mtoneladas?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) mpuestos?: number | null;

  @ApiPropertyOptional({ description: 'Tasa de exceso en % (0 a 100).' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(100) ptasaexc?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) pdescuento?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) precarofic?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) precarinfl?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) precarremo?: number | null;

  @ApiPropertyOptional({ description: 'Máximo de puestos (0 a 255).' }) @IsOptional() @IsInt() @Min(0) @Max(255) qmaxptos?: number | null;
  @ApiPropertyOptional({ description: 'Máximo de toneladas (0 a 32767).' }) @IsOptional() @IsInt() @Min(0) @Max(32767) qmaxton?: number | null;

  @ApiPropertyOptional({ default: false, description: 'true = grabar aunque el par exista en otro ramo (ver advertencias).' })
  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;
}

export class TramoAntiguedadDto {
  @ApiProperty({ example: 0, description: 'Antigüedad desde (años; -1 = vehículo del año siguiente).' }) @Type(() => Number) @IsInt() @Min(-1) @Max(32767) desde: number;
  @ApiProperty({ example: 5, description: 'Antigüedad hasta (años, inclusive).' }) @Type(() => Number) @IsInt() @Min(-1) @Max(32767) hasta: number;
  @ApiProperty({ example: 2.5, description: 'Tasa de casco en % (> 0).' }) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) pprima: number;
}

/** Reemplazo de los tramos 'V' de una cobertura y tarifa del plan. Lista vacía = inactivar todos. */
export class TasasAntiguedadDto {
  @ApiProperty({ type: [TramoAntiguedadDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TramoAntiguedadDto)
  tramos: TramoAntiguedadDto[];

  @ApiPropertyOptional({ default: false, description: 'true = grabar aunque la cobertura no sea de casco (el SP no la usará).' })
  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;
}
