import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

export class RmsSyncSiniestroDto {
  @ApiProperty({ example: '7-1-1000002371' })
  @IsString()
  cnpoliza: string;

  @ApiPropertyOptional({ example: 'siniestro.actualizado' })
  @IsOptional()
  @IsString()
  evento?: string;

  @ApiPropertyOptional({ example: 292910 })
  @IsOptional()
  @IsInt()
  n_siniestro?: number;

  @ApiPropertyOptional({ example: 225727 })
  @IsOptional()
  @IsInt()
  n_clave?: number;

  @ApiPropertyOptional({ example: 'SIN-9000123' })
  @IsOptional()
  @IsString()
  csiniestro?: string;

  @ApiPropertyOptional({ example: 'V-28511812' })
  @IsOptional()
  @IsString()
  asegurado?: string;

  @ApiPropertyOptional({ example: 'PRE' })
  @IsOptional()
  @IsString()
  cd_estatus?: string;

  @ApiPropertyOptional({ example: '2026-07-20' })
  @IsOptional()
  @IsString()
  focurrencia?: string;

  @ApiPropertyOptional({ example: '2026-07-21' })
  @IsOptional()
  @IsString()
  fnotificacion?: string;

  @ApiPropertyOptional({ example: 'BS' })
  @IsOptional()
  @IsString()
  cmoneda?: string;

  @ApiPropertyOptional({ example: 150.5 })
  @IsOptional()
  @IsNumber()
  mmontosiniestro?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xobserva?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  ccausa?: number;
}

export class RmsSiniestroValidarDto {
  @ApiProperty({ example: '7-1-1000002371' })
  @IsString()
  cnpoliza: string;

  @ApiPropertyOptional({ example: '2026-07-20' })
  @IsOptional()
  @IsString()
  focurrencia?: string;

  @ApiPropertyOptional({ example: '2026-07-21' })
  @IsOptional()
  @IsString()
  fnotificacion?: string;
}

export class RmsSiniestroEmitirDto {
  @ApiProperty({ example: '7-1-1000002421' })
  @IsString()
  cnpoliza: string;

  @ApiPropertyOptional({ example: '2026-09-21 00:00:00' })
  @IsOptional()
  @IsString()
  focurencia?: string;

  @ApiPropertyOptional({ example: '2026-09-21' })
  @IsOptional()
  @IsString()
  focurrencia?: string;

  @ApiPropertyOptional({ example: '2026-09-21 16:00:00' })
  @IsOptional()
  @IsString()
  fnotificacion?: string;

  @ApiPropertyOptional({ example: 'J-24174934' })
  @IsOptional()
  @IsString()
  asegurado?: string;

  @ApiPropertyOptional({ example: 'BS' })
  @IsOptional()
  @IsString()
  cmoneda?: string;

  @ApiPropertyOptional({ example: 'Prueba QA 24174934' })
  @IsOptional()
  @IsString()
  xobserva?: string;

  @ApiPropertyOptional({ example: 'S' })
  @IsOptional()
  @IsString()
  itiposiniestro?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  ccausa?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  mmontosiniestro?: number;

  @ApiPropertyOptional({ example: 58 })
  @IsOptional()
  @IsInt()
  cpais?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  cestado?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  cciudad?: number;

  @ApiPropertyOptional({ example: 999 })
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
