import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AUTO_IFRECUENCIA_VALUES } from '../../valrep/constants/auto-ifrecuencia.constants';

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

  @ApiPropertyOptional({
    example: 'S',
    description: 'Frecuencia de pago Sis2000 (ifrecuencia). Actualiza la póliza al crear el recibo.',
    enum: AUTO_IFRECUENCIA_VALUES,
  })
  @IsOptional()
  @IsString()
  @IsIn([...AUTO_IFRECUENCIA_VALUES])
  ifrecuencia?: string;

  @ApiPropertyOptional({
    example: 'S',
    description: 'Alias de ifrecuencia / frecuencia de pago.',
    enum: AUTO_IFRECUENCIA_VALUES,
  })
  @IsOptional()
  @IsString()
  @IsIn([...AUTO_IFRECUENCIA_VALUES])
  frecuencia?: string;

  @ApiPropertyOptional({ example: 2, description: 'Número de cuotas del fraccionamiento' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ncuotas?: number;

  @ApiPropertyOptional({ example: 2, description: 'Alias de ncuotas' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cuotas?: number;
}
