import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class PolizasQueryDto {
  @ApiPropertyOptional({ description: 'ID de aseguradora origen' })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== '' ? Number(value) : undefined))
  aseguradoraId?: number;

  @ApiPropertyOptional({ description: 'Fecha desde (emisión)' })
  @IsOptional()
  @IsString()
  desde?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta (emisión)' })
  @IsOptional()
  @IsString()
  hasta?: string;

  @ApiPropertyOptional({ description: 'Estado de póliza' })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional({
    description: 'Forzar sync incremental antes de consultar',
    example: 'true',
  })
  @IsOptional()
  forceSync?: string | boolean | number;
}
