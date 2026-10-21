import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CoberturasQueryDto {
  @ApiPropertyOptional({ description: 'ID de aseguradora origen' })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== '' ? Number(value) : undefined))
  aseguradoraId?: number;

  @ApiPropertyOptional({ description: 'Ramo (cramo) para el que se listan las coberturas', example: 7 })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== '' ? Number(value) : undefined))
  @IsInt()
  cramo?: number;
}
