import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { isBinacionalFlag } from './binacional-flag.dto';

export class GetModeloDto {
  @ApiProperty({ example: 2022, description: 'Año del vehículo (1950–2030)' })
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2030)
  fano!: number;

  @ApiProperty({ example: '083', description: 'Código de marca (1–3 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5)
  cmarca!: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar binacionales (`ctarifabi > 0` en maanomod/VInma).',
  })
  @IsOptional()
  @Transform(({ value }) => (isBinacionalFlag(value) ? true : value === false || value === 'false' || value === 0 || value === '0' ? false : undefined))
  @IsBoolean()
  binacional?: boolean;
}
