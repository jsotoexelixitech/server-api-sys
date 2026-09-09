import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class RunSyncDto {
  @ApiProperty({
    description:
      'Entidad a sincronizar: recibos, siniestros, polizas, ramos, canales, productores, anulaciones, rechazos',
    example: 'polizas',
  })
  @IsString()
  entidad!: string;

  @ApiPropertyOptional({ description: 'ID de aseguradora (también vía filtros/header)' })
  @IsOptional()
  aseguradoraId?: number;

  @ApiPropertyOptional({ description: 'Filtros de sync (desde, hasta, aseguradoraId, etc.)' })
  @IsOptional()
  @IsObject()
  filtros?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Opciones de sync (force, desde, hasta, all, refreshScope)',
  })
  @IsOptional()
  @IsObject()
  sync?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Forzar sync ignorando TTL' })
  @IsOptional()
  @IsBoolean()
  forceSync?: boolean;

  @ApiPropertyOptional({
    description: 'Sincronizar la entidad en todas las aseguradoras activas',
  })
  @IsOptional()
  @IsBoolean()
  syncAll?: boolean;
}
