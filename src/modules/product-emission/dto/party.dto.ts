import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Datos de una persona/empresa (tomador, asegurado o beneficiario). */
export class PartyDto {
  @ApiProperty({ example: 'ANA ANGELINA JIMENEZ DE MONAGAS' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nombre!: string;

  @ApiProperty({ example: 'V-7716530', description: 'Cédula/RIF con prefijo V-/J-/E-/G-' })
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  identificacion!: string;

  @ApiPropertyOptional({ example: 'Hijo(a)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  parentesco?: string;

  @ApiPropertyOptional({ example: 'Caracas' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ciudad?: string;

  @ApiPropertyOptional({ example: 'Miranda' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  estado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;
}
