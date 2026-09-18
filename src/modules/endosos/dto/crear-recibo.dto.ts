import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AUTO_IFRECUENCIA_VALUES } from '../../valrep/constants/auto-ifrecuencia.constants';

export class CrearReciboEndosoDto {
  @ApiProperty({ example: '18-1-0000079163', description: 'Número de póliza exacto (cnpoliza)' })
  @IsString()
  cnpoliza: string;

  @ApiProperty({ example: 87.5, description: 'Prima total del endoso en divisas (USD). El SP la divide entre ncuotas si aplica fraccionamiento.' })
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

  @ApiPropertyOptional({ example: 2026, description: 'Año del período de la póliza a endosar (adpoliza.fanopol)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fanopol?: number;

  @ApiPropertyOptional({ example: 2026, description: 'Alias de fanopol' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fanopoliza?: number;

  @ApiPropertyOptional({ example: 9, description: 'Mes del período de la póliza a endosar (adpoliza.fmespol)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fmespol?: number;

  @ApiPropertyOptional({ example: 9, description: 'Alias de fmespol' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fmespoliza?: number;

  @ApiPropertyOptional({
    example: 'CA',
    description: 'Modalidad casco para el tarifador: RC solo RCV, CA/PT/PP conservan casco existente.',
    enum: ['RC', 'CA', 'PT', 'PP'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['RC', 'CA', 'PT', 'PP'])
  coberAdicional?: string;

  @ApiPropertyOptional({ example: 30816, description: 'Suma asegurada del vehículo / casco' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  msumaaseg?: number;

  @ApiPropertyOptional({ example: 2.4, description: 'Tasa cobertura amplia (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tasaCa?: number;

  @ApiPropertyOptional({ example: 0, description: 'Tasa pérdida total (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tasaPt?: number;

  @ApiPropertyOptional({ example: 0, description: 'Tasa pérdida parcial (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tasaPp?: number;

  @ApiPropertyOptional({ example: 0, description: 'Recargo RCV (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precargorcv?: number;

  @ApiPropertyOptional({ example: 0, description: 'Toneladas del vehículo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ntoneladas?: number;
}
