import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches, MaxLength } from 'class-validator';

export class SearchSiniestrosExistentesDto {
  @ApiPropertyOptional({ example: '18-1-1000031086', description: 'Número de póliza (cnpoliza). Póliza o placa es obligatoria.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(30)
  @Matches(/^[0-9A-Za-z-]+$/, { message: 'cnpoliza solo admite números, letras y guiones' })
  cnpoliza?: string;

  @ApiPropertyOptional({ example: 'AT9A03M', description: 'Placa del vehículo. Póliza o placa es obligatoria.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @MaxLength(20)
  @Matches(/^[0-9A-Z-]+$/, { message: 'placa solo admite letras, números y guiones' })
  placa?: string;

  @ApiPropertyOptional({ example: '2026-08-10', description: 'Fecha de ocurrencia (YYYY-MM-DD): solo siniestros de ese día' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'focurrencia debe tener formato YYYY-MM-DD' })
  focurrencia?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'true (por defecto): solo abiertos (P pendiente, R reabierto). false: todos, con su estatus.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'false' || value === false ? false : value === 'true' || value === true ? true : value))
  @IsBoolean()
  soloAbiertos?: boolean;
}
