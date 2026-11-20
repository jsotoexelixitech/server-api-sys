import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Matches, Min, NotEquals } from 'class-validator';

/** Motivos de rechazo de SIS2000 (`marechazo`). */
export const MOTIVOS_RECHAZO = {
  EXTEMPORANEIDAD: 1,
  FALTA_DE_RECAUDOS: 2,
  FALTA_DE_PAGO: 3,
  DANOS_PARCIALES: 4,
  RESPONSABILIDAD_COMPARTIDA: 5,
  SIN_RESPONSABILIDAD_DEL_ASEGURADO: 6,
} as const;

export class RechazarSiniestroDto {
  @ApiProperty({ example: '18000000002301', description: 'Identificador del siniestro en Sis2000 (csinies, texto de 1 a 19 dígitos)' })
  @Matches(/^\d{1,19}$/, { message: 'csinies debe tener entre 1 y 19 dígitos' })
  csinies: string;

  @ApiProperty({ enum: Object.keys(MOTIVOS_RECHAZO), description: 'Motivo (marechazo): EXTEMPORANEIDAD=1, FALTA_DE_RECAUDOS=2, ...' })
  @IsIn(Object.keys(MOTIVOS_RECHAZO))
  motivo: keyof typeof MOTIVOS_RECHAZO;

  @ApiProperty({ example: 15504158, description: 'Usuario de Sis2000 que rechaza: el de la sesión (personal/productor) o la cédula del cliente. Obligatorio. Nunca 999 (reservado a RMS).' })
  @IsInt({ message: 'cusuario es obligatorio y debe ser un número entero' })
  @Min(1, { message: 'cusuario debe ser mayor que 0' })
  @NotEquals(999, { message: 'cusuario 999 está reservado a RMS' })
  cusuario: number;
}
