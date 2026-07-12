import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GetCotizacionAutoDto {
  @ApiProperty({ example: '083', description: 'Código INMA de marca (1–5 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5)
  cmarca: string;

  @ApiProperty({ example: '001', description: 'Código INMA de modelo (1–5 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5)
  cmodelo: string;

  @ApiProperty({ example: '03', description: 'Código INMA de versión (1–5 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5)
  cversion: string;

  @ApiProperty({ example: 2016, description: 'Año del vehículo (1950–2030)' })
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2030)
  fano: number;

  @ApiProperty({
    example: 'RCVBAS',
    description: 'Código de plan Sis2000 (cplan de spBuscaPlan / valrep/planes/v2)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  cplan: string;

  @ApiProperty({ example: 2, description: 'Categoría de uso numérica (≥0, de /inma/categorias-uso)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ccategoria_uso: number;

  @ApiPropertyOptional({
    example: 'N',
    description: "Tipo de placa: 'N'=nacional, 'E'=extranjera, 'B'=Bolipuerto",
    enum: ['N', 'E', 'B'],
  })
  @IsOptional()
  @IsIn(['N', 'E', 'B'])
  iplaca?: string;

  @ApiPropertyOptional({ example: 0, description: 'Toneladas de carga (≥0)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ntoneladas?: number;

  @ApiPropertyOptional({ example: 18, description: 'Código de ramo (default 18 = RCV)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cramo?: number;
}
