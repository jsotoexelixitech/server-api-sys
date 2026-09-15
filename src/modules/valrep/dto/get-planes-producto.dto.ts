import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body para POST /valrep/planes/producto (funerario — spBuscaPlanProducto). */
export class GetPlanesProductoDto {
  @ApiProperty({
    example: '57',
    description: 'Código de producto de personas (paso 1 — valrep/productos).',
  })
  @IsString()
  @IsNotEmpty()
  cproducto: string;

  @ApiPropertyOptional({ example: '80080', description: 'Ítem/productor (opcional).' })
  @IsOptional()
  @IsString()
  citem?: string;

  @ApiPropertyOptional({ example: 'P', description: 'Entidad asociada al ítem (opcional).' })
  @IsOptional()
  @IsString()
  centidad?: string;
}
