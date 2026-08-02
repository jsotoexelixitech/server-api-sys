import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CambioDatosPolizaDto {
  @ApiProperty({ example: '18-1-0000079163', description: 'Número de póliza' })
  @IsString()
  cnpoliza: string;

  @ApiProperty({ example: 2026, description: 'Año de la póliza (fanopol)' })
  @IsInt()
  fanopol: number;

  @ApiProperty({ example: 8, description: 'Mes de la póliza (fmespol)' })
  @IsInt()
  fmespol: number;

  @ApiProperty({ example: 'ASEGURADO', description: 'Tipo de cambio: ASEGURADO, TOMADOR o BENEFICIARIO' })
  @IsString()
  tipoCambio: string;

  @ApiProperty({ example: 12345678, description: 'Cédula o RIF numérico del titular' })
  @IsInt()
  cci_rif: number;

  @ApiPropertyOptional({ example: 'N', description: 'Tipo de persona (N=Natural, J=Jurídica, E=Extranjero)' })
  @IsOptional()
  @IsString()
  ipersona?: string;

  @ApiPropertyOptional({ example: 'V', description: 'Nacionalidad (V, E, J)' })
  @IsOptional()
  @IsString()
  icedula?: string;

  @ApiProperty({ example: 'GABRIEL MONCADA', description: 'Nombre completo o Razón social' })
  @IsString()
  xcliente: string;

  @ApiPropertyOptional({ example: 'GABRIEL', description: 'Nombre' })
  @IsOptional()
  @IsString()
  xnombre?: string;

  @ApiPropertyOptional({ example: 'MONCADA', description: 'Apellido' })
  @IsOptional()
  @IsString()
  xapellido?: string;

  @ApiPropertyOptional({ example: 'Av. Principal Las Mercedes', description: 'Dirección' })
  @IsOptional()
  @IsString()
  xdireccion?: string;

  @ApiPropertyOptional({ example: '04141234567', description: 'Teléfono' })
  @IsOptional()
  @IsString()
  xtelefono?: string;

  @ApiPropertyOptional({ example: 'gabriel@gmail.com', description: 'Correo electrónico' })
  @IsOptional()
  @IsString()
  xcorreo?: string;

  @ApiPropertyOptional({ example: 1422, description: 'ID del usuario operador' })
  @IsOptional()
  @IsInt()
  cusuario?: number;
}
