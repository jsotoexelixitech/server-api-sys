import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

function optionalString({ value }: { value: unknown }): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value).trim() || undefined;
}

export class GetPlanesPerDto {
  @ApiPropertyOptional({
    example: 45,
    description: 'Código de ramo (9 = funerario genérico; 45 con cproducto 57).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cramo?: number;

  @ApiPropertyOptional({
    example: null,
    description: 'Tipo (opcional). Normalmente null para personas.',
  })
  @IsOptional()
  @IsInt()
  ctipo?: number | null;

  @ApiPropertyOptional({
    example: '57',
    description: 'Producto Sis2000. Con esto se usa spBuscaPlanProducto.',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  cproducto?: string;

  @ApiPropertyOptional({ example: 'C', description: 'Entidad del canal (P/C/G).' })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  centidad?: string;

  @ApiPropertyOptional({
    example: '27',
    description: 'Ítem del canal (productor/corredor/gestor).',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  citem?: string;
}
