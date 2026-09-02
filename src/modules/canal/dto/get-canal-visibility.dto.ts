import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

/** Query para GET /canal/visibility — reglas de UI por entidad Sis2000. */
export class GetCanalVisibilityDto {
  @ApiPropertyOptional({ example: 1, description: 'Canal alterno (si centidad=C).' })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  ccanalalt?: number;

  @ApiPropertyOptional({ example: 'P', description: 'Entidad: P=productor/gestor, C=canal.' })
  @IsOptional()
  @IsString()
  @IsIn(['P', 'C', 'p', 'c'])
  centidad?: string;

  @ApiPropertyOptional({ example: '215', description: 'Ítem de la entidad (citem marketplace).' })
  @IsOptional()
  @IsString()
  citem?: string;

  @ApiPropertyOptional({ example: '215-28', description: 'Gestor marketplace (magestor.cgestor).' })
  @IsOptional()
  @IsString()
  cgestor?: string;

  @ApiPropertyOptional({ example: '248', description: 'Producto para filtrar planes y reglas de pago.' })
  @IsOptional()
  @IsString()
  cproducto?: string;

  @ApiPropertyOptional({ example: 18, description: 'Ramo (p. ej. 18 = RCV).' })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  cramo?: number;

  @ApiPropertyOptional({ example: 1, description: 'Subcanal alterno (cscanalalt), si aplica.' })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  cscanalalt?: number;
}
