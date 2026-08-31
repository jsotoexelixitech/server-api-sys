import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AUTO_IFRECUENCIA_VALUES } from '../constants/auto-ifrecuencia.constants';

/** Body compatible con SysIP `POST /emissions/calculatePlanSis`. */
export class CalculatePlanCoberturasDto {
  @ApiProperty({ example: '083', description: 'Código de marca INMA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  cmarca: string;

  @ApiProperty({ example: '001', description: 'Código de modelo INMA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  cmodelo: string;

  @ApiProperty({ example: '03', description: 'Código de versión INMA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  cversion: string;

  @ApiProperty({ example: 2016, description: 'Año del vehículo' })
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2030)
  cano: number;

  @ApiProperty({ example: '01', description: 'Código de plan (SysIP: idPlan)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  idPlan: string;

  @ApiPropertyOptional({ example: 15000, description: 'Suma asegurada vehículo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  suma?: number;

  @ApiPropertyOptional({ example: 0, description: 'Suma asegurada blindaje' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sumaAsegBl?: number;

  @ApiPropertyOptional({ example: 0, description: 'Suma asegurada aditamentos' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sumaAsegAd?: number;

  @ApiPropertyOptional({ example: 'N', enum: ['N', 'E', 'B'] })
  @IsOptional()
  @IsIn(['N', 'E', 'B'])
  iplaca?: string;

  @ApiProperty({ example: '2026-08-14', description: 'Vigencia desde (ISO date)' })
  @IsDateString()
  fdesde: string;

  @ApiProperty({ example: '2027-08-14', description: 'Vigencia hasta (ISO date)' })
  @IsDateString()
  fhasta: string;

  @ApiPropertyOptional({ example: null, description: 'Tasa casco (nullable). Ignorado por sp_calculo_auto_nexus — el SP resuelve tasas internamente.' })
  @IsOptional()
  @Type(() => Number)
  tasaPt?: number | null;

  @ApiPropertyOptional({ example: null, description: 'Tasa casco CA (nullable). Ignorado por sp_calculo_auto_nexus.' })
  @IsOptional()
  @Type(() => Number)
  tasaCa?: number | null;

  @ApiPropertyOptional({ example: null, description: 'Tasa pérdida parcial PP (nullable). Ignorado por sp_calculo_auto_nexus.' })
  @IsOptional()
  @Type(() => Number)
  tasaPp?: number | null;

  @ApiPropertyOptional({ example: 0, description: 'Recargo porcentual' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  recargo?: number;

  @ApiPropertyOptional({
    example: 4,
    description: 'Tipo de vehículo (ctipo INMA). Si se omite, se resuelve desde VInma.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tipo?: number;

  @ApiProperty({ example: 20, description: 'Categoría de uso (grupo / ccategotr)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  uso: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Total puestos (npasajero INMA). Si se omite, se resuelve desde VInma.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  puestos?: number;

  @ApiPropertyOptional({ example: 0, description: 'Toneladas de carga' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  toneladas?: number;

  @ApiPropertyOptional({ example: 'RC', description: 'Cobertura adicional seleccionada' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  coberAdicional?: string;

  @ApiPropertyOptional({ example: 0, description: 'Recargo RCV' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  recargoRcv?: number;

  @ApiPropertyOptional({ example: 18, description: 'Código de ramo (default 18)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cramo?: number;

  @ApiPropertyOptional({
    example: 'A',
    description: 'Frecuencia de pago (requerido por el SP de cálculo de plan auto)',
    enum: AUTO_IFRECUENCIA_VALUES,
  })
  @IsOptional()
  @IsIn([...AUTO_IFRECUENCIA_VALUES])
  ifrecuencia?: string;

  @ApiPropertyOptional({ example: 7, description: 'Usuario Sis2000 (default env LAMUNDIAL_CUSUARIO o 7)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cusuario?: number;
}
