import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Edades asegurables de un parentesco en la versión vigente del plan (mapledades_per). */
export class EdadesParentescoDto {
  @ApiProperty({ example: 18, description: 'Edad mínima asegurable.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(255)
  cemin_ase: number;

  @ApiProperty({ example: 74, description: 'Edad máxima asegurable.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(255)
  cemax_ase: number;

  @ApiPropertyOptional({ description: 'Edad mínima de grupo. En alta, por defecto cemin_ase.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(255)
  cemin_gi?: number;

  @ApiPropertyOptional({ description: 'Edad máxima de grupo. En alta, por defecto cemax_ase.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(255)
  cemax_gi?: number;

  @ApiPropertyOptional({ description: 'Suma vitalicia. En alta, por defecto 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  msvitalicia?: number;

  @ApiPropertyOptional({ description: 'Suma vitalicia en moneda extranjera. En alta, por defecto 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  msvitaliciaext?: number;

  @ApiPropertyOptional({ description: 'Edad de reducción. En alta, por defecto cemax_ase.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(255)
  cereduccion?: number;

  @ApiPropertyOptional({ description: 'Suma reducida. En alta, por defecto 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  msreducida?: number;

  @ApiPropertyOptional({ description: 'Suma reducida en moneda extranjera. En alta, por defecto 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  msreducidaext?: number;
}
