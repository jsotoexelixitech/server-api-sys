import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body SysIP Express `POST /api/v1/emissions/automobile/vehicle`.
 * Valida vigencia con `dbo.fn_validar_placa(@xplaca, @fdesde)`.
 */
export class SearchVehicleByPlateDto {
  @ApiPropertyOptional({
    example: 'AE218EG',
    description: 'Placa del vehículo (requerida si no envía `placa`). Máx. 15 caracteres.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  xplaca?: string;

  @ApiPropertyOptional({
    example: 'AE218EG',
    description: 'Alias de `xplaca`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  placa?: string;

  @ApiProperty({
    example: '2026-01-01',
    description: 'Fecha de inicio de vigencia a validar (ISO).',
  })
  @IsNotEmpty({ message: 'fdesde es obligatorio.' })
  @IsDateString({}, { message: 'fdesde debe ser una fecha ISO válida.' })
  fdesde!: string;

  @ApiPropertyOptional({
    example: 'warning',
    description:
      "Si vale exactamente `warning`, el mensaje indica advertencia de vigencia. " +
      'Cualquier otro valor (o vacío) usa el mensaje definitivo de placa activa.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  type?: string;
}

/**
 * Body SysIP Express `POST /api/v1/emissions/automobile/serial`.
 * Valida vigencia con `dbo.fn_validar_serialCar(@xsercar, @fdesde)`.
 */
export class SearchVehicleBySerialDto {
  @ApiPropertyOptional({
    example: 'KNAFC526365439484',
    description: 'Serial de carrocería (requerido si no envía `xserialcarroceria`).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  xsercar?: string;

  @ApiPropertyOptional({
    example: 'KNAFC526365439484',
    description: 'Alias de `xsercar`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  xserialcarroceria?: string;

  @ApiProperty({
    example: '2026-01-01',
    description: 'Fecha de inicio de vigencia a validar (ISO).',
  })
  @IsNotEmpty({ message: 'fdesde es obligatorio.' })
  @IsDateString({}, { message: 'fdesde debe ser una fecha ISO válida.' })
  fdesde!: string;

  @ApiPropertyOptional({
    example: 'warning',
    description:
      "Si vale exactamente `warning`, el mensaje indica advertencia de vigencia. " +
      'Cualquier otro valor (o vacío) usa el mensaje definitivo de serial activo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  type?: string;
}
