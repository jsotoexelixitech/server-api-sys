import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** Body para spBuscaProductosEntidad (canal alternativo / personas). */
export class GetProductosCanalDto {
  @ApiPropertyOptional({
    example: 'C',
    description: 'Entidad canal: P=productor, C=canal. Default desde CANAL_DEFAULT_CENTIDAD o null.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['P', 'C'])
  centidad?: string;

  @ApiPropertyOptional({
    example: '80080',
    description: 'Ítem del canal (subcanal). Default desde CANAL_DEFAULT_CITEM.',
  })
  @IsOptional()
  @IsString()
  citem?: string;
}
