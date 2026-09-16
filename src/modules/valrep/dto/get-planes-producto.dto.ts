import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body para POST /valrep/planes/producto (funerario — sp_busca_plan_producto_nexus). */
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

  @ApiPropertyOptional({
    example: 'P',
    description: 'Entidad del actor (P=productor, C=canal). Requerida con csubitem.',
  })
  @IsOptional()
  @IsString()
  centidad?: string;

  @ApiPropertyOptional({
    example: '80080',
    description:
      'Código gestor/sub-ítem (mausuplan.citem) para excluir planes restringidos al usuario. Requiere centidad.',
  })
  @IsOptional()
  @IsString()
  csubitem?: string;
}
