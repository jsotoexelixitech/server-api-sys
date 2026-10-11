import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ValidateSiniestroDto {
  @ApiProperty({ example: '18-1-1130480727', description: 'Número de póliza (cnpoliza)' })
  @IsString()
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9-]{3,30}$/, { message: 'cnpoliza inválido' })
  cnpoliza: string;

  @ApiProperty({ example: '2026-10-09', description: 'Fecha de ocurrencia (AAAA-MM-DD)' })
  @Matches(FECHA, { message: 'focurrencia debe ser AAAA-MM-DD' })
  focurrencia: string;

  @ApiProperty({ example: '2026-10-10', description: 'Fecha de notificación (AAAA-MM-DD)' })
  @Matches(FECHA, { message: 'fnotificacion debe ser AAAA-MM-DD' })
  fnotificacion: string;
}
