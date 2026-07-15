import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Body para POST /valrep/productos (funerario — spBuscaProductosEntidad). */
export class GetProductosPersonasDto {
  @ApiPropertyOptional({
    example: '80080',
    description: 'Código de ítem/productor. Si se envía, también debe enviarse centidad.',
  })
  @IsOptional()
  @IsString()
  citem?: string;

  @ApiPropertyOptional({
    example: 'P',
    description: 'Tipo de entidad (ej. P=productor). Solo aplica cuando viene citem.',
  })
  @IsOptional()
  @IsString()
  centidad?: string;
}
