import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, NotEquals } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Tipos de pérdida de SIS2000 (`matipoperdida`). */
export const TIPOS_PERDIDA = { TOTAL: 1, PARCIAL: 2, DANOS_A_COSAS: 3 } as const;

export class RegistrarSiniestroDto {
  @ApiProperty({ example: '18-1-1130480727', description: 'Número de póliza (cnpoliza). Debe estar en curso.' })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,30}$/, { message: 'cnpoliza inválido' })
  cnpoliza: string;

  @ApiProperty({ example: 'AB123CD', description: 'Placa del vehículo' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,12}$/, { message: 'placa inválida' })
  placa: string;

  @ApiProperty({ example: '2026-10-09', description: 'Fecha de ocurrencia (AAAA-MM-DD)' })
  @Matches(FECHA, { message: 'focurrencia debe ser AAAA-MM-DD' })
  focurrencia: string;

  @ApiPropertyOptional({ example: '2026-10-10', description: 'Fecha de notificación (AAAA-MM-DD). Por defecto, hoy.' })
  @IsOptional()
  @Matches(FECHA, { message: 'fnotificacion debe ser AAAA-MM-DD' })
  fnotificacion?: string;

  @ApiProperty({ example: 18126, description: 'Causa del siniestro (macausasin)' })
  @IsInt()
  @Min(1)
  ccausa: number;

  @ApiPropertyOptional({
    description: 'Monto estimado / reserva, en la MONEDA DE LA PÓLIZA (D20).',
    example: 500,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999999999)
  monto?: number;

  @ApiPropertyOptional({ enum: Object.keys(TIPOS_PERDIDA), description: 'Tipo de pérdida (matipoperdida: TOTAL=1, PARCIAL=2, DANOS_A_COSAS=3)' })
  @IsOptional()
  @IsIn(Object.keys(TIPOS_PERDIDA))
  tipoPerdida?: keyof typeof TIPOS_PERDIDA;

  @ApiPropertyOptional({ example: 10, description: 'Cobertura afectada (ccobertura). La reserva se carga solo en ella; si falta, en la de menor código que cubra la causa.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  ccobertura?: number;

  @ApiPropertyOptional({
    example: 15504158,
    description:
      'Usuario de Sis2000 que registra: el de la sesión (personal/productor) o la cédula del cliente que declara. ' +
      'Si falta se usa SINIESTROS_CUSUARIO. Nunca 999 (reservado a RMS).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @NotEquals(999, { message: 'cusuario 999 está reservado a RMS' })
  cusuario?: number;

  @ApiPropertyOptional({ example: 58 })
  @IsOptional()
  @IsInt()
  cpais?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  cestado?: number;

  @ApiPropertyOptional({ example: 27 })
  @IsOptional()
  @IsInt()
  cciudad?: number;

  @ApiPropertyOptional({ description: 'Observaciones (máx. 254). Sin datos personales innecesarios.' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  xobserva?: string;
}
