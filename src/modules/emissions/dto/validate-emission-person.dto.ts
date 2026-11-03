import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { CID_PASAPORTE_MSG, CID_PASAPORTE_RE, blankToUndefined } from '../../personas/personas-identidad.rules';

export class ValidateEmissionPersonDto {
  @ApiProperty({ example: 18, description: 'Código de ramo' })
  @IsInt({ message: 'El ramo debe ser un número entero.' })
  @Min(1, { message: 'El ramo debe ser mayor a 0.' })
  cramo: number;

  @ApiProperty({ example: 'RCVBAS', description: 'Código del plan' })
  @IsString({ message: 'El plan debe ser texto.' })
  @IsNotEmpty({ message: 'El plan es requerido.' })
  plan: string;

  @ApiPropertyOptional({ example: '2025-06-30', description: 'Fecha de emisión (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de emisión debe ser una fecha válida (YYYY-MM-DD).' })
  femision?: string;

  @ApiPropertyOptional({ example: '2025-06-30', description: 'Alias de femision (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de emisión debe ser una fecha válida (YYYY-MM-DD).' })
  fecha_emision?: string;

  @ApiPropertyOptional({ example: '2025-06-30', description: 'Inicio de vigencia (prorrata viajero)' })
  @IsOptional()
  @IsDateString()
  fdesde?: string;

  @ApiPropertyOptional({ example: '2025-08-03', description: 'Fin de vigencia (prorrata viajero)' })
  @IsOptional()
  @IsDateString()
  fhasta?: string;

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

  @ApiPropertyOptional({ example: 'V', description: 'Tipo de cédula del tomador' })
  @IsOptional()
  @IsString()
  tipo_cedula_tomador?: string;

  @ApiPropertyOptional({ example: 'P-EM2849387', description: 'Pasaporte alfanumérico del titular (maclient.cid); rif_titular = solo dígitos' })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Matches(CID_PASAPORTE_RE, { message: `cid_titular: ${CID_PASAPORTE_MSG}` })
  cid_titular?: string;

  @ApiPropertyOptional({ example: 'P-EM2849387', description: 'Pasaporte alfanumérico del tomador (maclient.cid); rif_tomador = solo dígitos' })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Matches(CID_PASAPORTE_RE, { message: `cid_tomador: ${CID_PASAPORTE_MSG}` })
  cid_tomador?: string;
}
