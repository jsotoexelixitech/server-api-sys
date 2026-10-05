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

  @ApiPropertyOptional({ example: 'C', description: 'Marketplace: P productor · C canal · G gestor.' })
  @IsOptional()
  @IsString()
  centidad?: string;

  @ApiPropertyOptional({ description: 'Marketplace: productor si P, canal si C, gestor si G.' })
  @IsOptional()
  citem?: string | number;

  @ApiPropertyOptional({ description: 'Marketplace: subcanal (csub).' })
  @IsOptional()
  csub?: string | number;
}

/** Objeto `gestor` de SysIP marketplace (post-emisión en La Mundial). */
export class GestorViajeroDto {
  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ccanalalt?: number | null;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cscanalalt?: number | null;

  @ApiPropertyOptional({ description: 'Código magestor. El SP de personas no lo persiste.' })
  @IsOptional()
  @IsString()
  cgestor?: string;
}
