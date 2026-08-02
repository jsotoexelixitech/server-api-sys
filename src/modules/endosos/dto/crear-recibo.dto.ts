import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CrearReciboEndosoDto {
  @ApiProperty({ example: '18-1-0000079163', description: 'Número de póliza exacto (cnpoliza)' })
  @IsString()
  cnpoliza: string;

  @ApiProperty({ example: 87.5, description: 'Prima neta del endoso en divisas (USD)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mprima: number;

  @ApiProperty({ example: '2026-08-02', description: 'Fecha inicio vigencia del recibo de endoso (YYYY-MM-DD)' })
  @IsString()
  fdesde: string;

  @ApiProperty({ example: '2027-08-02', description: 'Fecha fin vigencia del recibo de endoso (YYYY-MM-DD)' })
  @IsString()
  fhasta: string;

  @ApiPropertyOptional({ example: 'BINAC', description: 'Nuevo plan si el endoso incluye cambio de plan' })
  @IsOptional()
  @IsString()
  cplan?: string;

  @ApiPropertyOptional({ example: 1422, description: 'ID del usuario operador' })
  @IsOptional()
  @IsInt()
  cusuario?: number;
}
