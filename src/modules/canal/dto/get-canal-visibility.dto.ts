import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Query para GET /canal/visibility — reglas de UI por canal alterno. */
export class GetCanalVisibilityDto {
  @ApiProperty({ example: 1, description: 'Código de canal alterno (ccanalalt).' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  ccanalalt: number;

  @ApiPropertyOptional({ example: '57', description: 'Producto para filtrar planes y overrides.' })
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
