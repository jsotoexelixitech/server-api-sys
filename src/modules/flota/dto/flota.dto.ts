import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';

/** Cabecera de la póliza de flota (colectiva 'C') SIN recibos por certificado. */
export class CrearPolizaFlotaDto {
  @ApiProperty({ example: 18, description: 'Ramo (18 = automóvil).' })
  @IsInt() @Min(1)
  cramo: number;

  @ApiProperty({ example: 'RIDER1', description: 'Plan de la flota.' })
  @IsString() @MaxLength(10)
  cplan: string;

  @ApiProperty({ example: 'J-123456789', description: 'Cédula/RIF del tomador (debe existir en maclient).' })
  @IsString() @MaxLength(20)
  cidTomador: string;

  @ApiPropertyOptional({ example: 80080 })
  @IsOptional() @IsInt()
  cproductor?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  csucur?: number;

  @ApiPropertyOptional({ example: '$', description: "Moneda Sis2000 ('$' o 'Bs')." })
  @IsOptional() @IsString() @MaxLength(4)
  cmoneda?: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  fdesde: string;

  @ApiProperty({ example: '2027-11-01' })
  @IsDateString()
  fhasta: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  cusuario?: number;
}

export class ConductorCertificadoDto {
  @ApiProperty({ example: 'V-12345678' })
  @IsString() @MaxLength(20)
  cid: string;

  @ApiProperty({ example: 'JOSE PEREZ' })
  @IsString() @MaxLength(100)
  nombre: string;
}

/** Inclusión de un vehículo (certificado) con su conductor, SIN recibo. */
export class IncluirCertificadoDto {
  @ApiProperty({ example: 'AB123CD' })
  @IsString() @MaxLength(15)
  xplaca: string;

  @ApiPropertyOptional({ example: '8XA53ZEC5K1234567' })
  @IsOptional() @IsString() @MaxLength(30)
  xsercar?: string;

  @ApiPropertyOptional({ example: 'K1234567' })
  @IsOptional() @IsString() @MaxLength(30)
  xsermot?: string;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional() @IsInt()
  cano?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional() @IsInt()
  cmarca?: number;

  @ApiPropertyOptional({ example: 101 })
  @IsOptional() @IsInt()
  cmodelo?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  cversion?: number;

  @ApiPropertyOptional({ example: 'BLANCO' })
  @IsOptional() @IsString() @MaxLength(30)
  xcolor?: string;

  @ApiProperty({ type: ConductorCertificadoDto })
  @ValidateNested() @Type(() => ConductorCertificadoDto)
  conductor: ConductorCertificadoDto;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Fecha de inclusión. Por defecto, hoy.' })
  @IsOptional() @IsDateString()
  fdesde?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  cusuario?: number;
}

export class ExcluirCertificadoDto {
  @ApiPropertyOptional({ example: '2026-11-30', description: 'Fecha de exclusión. Por defecto, hoy.' })
  @IsOptional() @IsDateString()
  fexclusion?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  cusuario?: number;
}

/** Recibo de UN viaje sobre un certificado de la póliza de flota. */
export class ReciboCertificadoDto {
  @ApiProperty({ example: 1, description: 'Prima del recibo en la moneda indicada.' })
  @IsNumber() @Min(0.01)
  mprima: number;

  @ApiPropertyOptional({ example: '$', enum: ['$', 'Bs'] })
  @IsOptional() @IsIn(['$', 'Bs'])
  cmoneda?: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  fdesde: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  fhasta: string;

  @ApiProperty({ example: 'VIAJE:RDY-000123', description: 'Idempotencia: un recibo por referencia.' })
  @IsString() @MaxLength(120)
  creferencia: string;

  @ApiPropertyOptional({ example: 'Viaje RDY-000123 · URBANO 9.1 km · pago PAY-778899' })
  @IsOptional() @IsString() @MaxLength(250)
  xobservacion?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  cusuario?: number;
}
