import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** Body para spBuscaPlanProducto. */
export class GetPlanesProductoDto {
  @ApiProperty({ example: '1', description: 'Código de producto (maproductos). Vida=1, viajero puede ser 24.' })
  @IsString()
  cproducto!: string;

  @ApiPropertyOptional({ example: 'C' })
  @IsOptional()
  @IsString()
  @IsIn(['P', 'C'])
  centidad?: string;

  @ApiPropertyOptional({ example: '80080' })
  @IsOptional()
  @IsString()
  citem?: string;
}
