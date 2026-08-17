import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/** Flag opcional: catálogo binacional (maanomod / VInma con ctarifabi > 0). */
export class BinacionalCatalogFlagDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'Si true, filtra vehículos binacionales desde maanomod/VInma con `ctarifabi > 0`. ' +
      'Solo aplica cuando el tipo de placa es binacional.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  binacional?: boolean;
}

export function isBinacionalFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}
