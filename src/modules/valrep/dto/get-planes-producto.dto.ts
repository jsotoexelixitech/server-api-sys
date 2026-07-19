import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body para POST /valrep/planes/producto (spBuscaPlanProducto). */
export class GetPlanesProductoDto {
  @ApiProperty({
    example: '1',
    description: 'Código de producto (maproductos). Vida=1, funerario=57, viajero=24.',
  })
  @IsString()
  @IsNotEmpty()
  cproducto!: string;

  @ApiPropertyOptional({ example: '80080', description: 'Ítem/productor (opcional).' })
  @IsOptional()
  @IsString()
  citem?: string;

  @ApiPropertyOptional({ example: 'C', description: 'P=productor, C=canal.' })
  @IsOptional()
  @IsString()
  @IsIn(['P', 'C'])
  centidad?: string;
}
