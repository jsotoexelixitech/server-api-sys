import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CalcularPrimaEndosoDto {
  @ApiProperty({ example: 'BINAC', description: 'Código del plan' })
  @IsString()
  cplan: string;

  @ApiProperty({ example: '2026-08-02', description: 'Fecha inicio de la vigencia del endoso' })
  @IsString()
  fdesde: string;

  @ApiProperty({ example: '2027-08-02', description: 'Fecha fin de la vigencia del endoso' })
  @IsString()
  fhasta: string;

  @ApiPropertyOptional({ example: '18-1-0000079163', description: 'Número de póliza si el cálculo aplica sobre una póliza existente' })
  @IsOptional()
  @IsString()
  cnpoliza?: string;

  @ApiPropertyOptional({ example: 200.0, description: 'Prima base anual precalculada (USD)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mprima_anual?: number;
}
