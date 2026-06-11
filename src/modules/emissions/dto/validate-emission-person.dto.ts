import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ValidateEmissionPersonDto {
  @ApiProperty({ example: 18, description: 'Código de ramo' })
  @IsInt({ message: 'El ramo debe ser un número entero.' })
  @Min(1, { message: 'El ramo debe ser mayor a 0.' })
  cramo: number;

  @ApiProperty({ example: 'RCVBAS', description: 'Código del plan' })
  @IsString({ message: 'El plan debe ser texto.' })
  @IsNotEmpty({ message: 'El plan es requerido.' })
  plan: string;

  @ApiProperty({ example: '2025-06-30', description: 'Fecha de emisión (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'La fecha de emisión debe ser una fecha válida (YYYY-MM-DD).' })
  femision: string;

  @ApiProperty({ example: 25221952, description: 'RIF del titular' })
  @IsNumber({}, { message: 'El RIF del titular debe ser numérico.' })
  rif_titular: number | string;

  @ApiProperty({ example: '1996-10-13', description: 'Fecha de nacimiento del titular (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'La fecha de nacimiento del titular debe ser una fecha válida (YYYY-MM-DD).' })
  fnac_titular: string;

  @ApiPropertyOptional({ example: 25221952, description: 'RIF del tomador (si es diferente al titular)' })
  @IsOptional()
  @IsNumber()
  rif_tomador?: number | string;

  @ApiPropertyOptional({ example: '1996-10-13', description: 'Fecha de nacimiento del tomador' })
  @IsOptional()
  @IsDateString()
  fnac_tomador?: string;

  @ApiPropertyOptional({ example: 'V', description: 'Tipo de cédula del titular', enum: ['V', 'E', 'J', 'G', 'P'] })
  @IsOptional()
  @IsIn(['V', 'E', 'J', 'G', 'P'])
  tipo_cedula_titular?: string;
}
