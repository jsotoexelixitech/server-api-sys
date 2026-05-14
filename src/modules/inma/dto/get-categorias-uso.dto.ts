import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class GetCategoriasUsoDto {
  @ApiProperty({ example: 2022, description: 'Año del vehículo (1950–2030)' })
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2030)
  fano: number;

  @ApiProperty({ example: '083', description: 'Código de marca (1–5 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5)
  cmarca: string;

  @ApiProperty({ example: '001', description: 'Código de modelo (1–5 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5)
  cmodelo: string;

  @ApiProperty({ example: '03', description: 'Código de versión (1–5 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5)
  cversion: string;
}
