import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { AUTO_IFRECUENCIA_VALUES } from '../../valrep/constants/auto-ifrecuencia.constants';

/** Cobertura del cuadro a persistir en adpolcob/adpoltar al crear el recibo. */
export class CoberturaReciboEndosoDto {
  @ApiPropertyOptional({ example: 6, description: 'Código de cobertura (ccobertura)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ccobertura?: number;

  @ApiPropertyOptional({ example: 6, description: 'Alias de ccobertura' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ccober?: number;

  @ApiPropertyOptional({ example: 'RCV DAÑOS A PERSONAS' })
  @IsOptional()
  @IsString()
  xcobertura?: string;

  @ApiPropertyOptional({ example: 7000, description: 'Suma asegurada (moneda póliza)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  msumaaseg?: number;

  @ApiPropertyOptional({ example: 7000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  msumaasegurada?: number;

  @ApiPropertyOptional({ example: 7000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  masegurada?: number;

  @ApiPropertyOptional({ example: 25.5, description: 'Prima de la cobertura (moneda póliza, período completo)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mprima?: number;

  @ApiPropertyOptional({ example: 25.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  prima?: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ptasa?: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tasa?: number;
}

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
    type: [CoberturaReciboEndosoDto],
    description:
      'Cuadro de coberturas a persistir en adpolcob/adpoltar. Si no llega, el SP usa maplantar del plan.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoberturaReciboEndosoDto)
  coberturas?: CoberturaReciboEndosoDto[];
}
