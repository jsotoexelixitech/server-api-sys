import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Canal Sis2000 en el body (API aislada, no JWT).
 * Mismos códigos que el SP de emisión de personas.
 */
export class CanalViajeroDto {
  @ApiPropertyOptional({ example: 80080, description: 'Productor Sis2000.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cproductor?: number;

  @ApiPropertyOptional({ example: 80080 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productor?: number;

  @ApiPropertyOptional({ example: 1422, description: 'Usuario Sis2000.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number;

  @ApiPropertyOptional({ example: 'T', description: 'T / A / D.' })
  @IsOptional()
  @IsString()
  ctipocanal?: string | null;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ccanalalt?: number | null;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ccanalalt_in?: number | null;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cscanalalt?: number | null;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cscanalalt_in?: number | null;

  @ApiPropertyOptional({ description: 'Gestor (magestor). Se acepta; el SP de personas no lo recibe hoy.' })
  @IsOptional()
  @IsString()
  cgestor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cgestor_in?: string;
}
