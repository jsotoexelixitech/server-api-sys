import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { isBinacionalFlag } from './binacional-flag.dto';

export class GetMarcasDto {
  @ApiProperty({ example: 2022, description: 'Año de fabricación del vehículo (1950–2030)' })
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2030)
  fano!: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar binacionales (`ctarifabi > 0` en maanomod/VInma).',
  })
  @IsOptional()
  @Transform(({ value }) => (isBinacionalFlag(value) ? true : value === false || value === 'false' || value === 0 || value === '0' ? false : undefined))
  @IsBoolean()
  binacional?: boolean;
}
