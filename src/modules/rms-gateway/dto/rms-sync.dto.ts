import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RmsSyncConsultaDto {
  @ApiProperty({ example: '7-1-1000002371' })
  @IsString()
  cnpoliza: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  fanopol?: number;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @IsInt()
  fmespol?: number;
}

export class RmsSyncAplicarDto extends RmsSyncConsultaDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Si true, encola y aplica según el informe (Sis2000 ↔ RMS).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  aplicar?: boolean;
}

export class RmsSyncDesdeRmsDto {
  @ApiProperty({ example: '7-1-1000002371' })
  @IsString()
  cnpoliza: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  fanopol?: number;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @IsInt()
  fmespol?: number;

  @ApiProperty({ example: 'TOMADOR' })
  @IsString()
  tipoCambio: string;

  @ApiProperty({ example: 28511812 })
  @IsInt()
  cci_rif: number;

  @ApiPropertyOptional({ example: 'V' })
  @IsOptional()
  @IsString()
  icedula?: string;

  @ApiProperty({ example: 'Jorge Duran QA-SYNC' })
  @IsString()
  xcliente: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xnombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xapellido?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xdireccion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xtelefono?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xcorreo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  cusuario?: number;
}

export class RmsSyncDrenarDto {
  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
