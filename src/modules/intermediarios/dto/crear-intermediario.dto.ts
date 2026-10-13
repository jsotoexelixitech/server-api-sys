import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Alta de intermediario tradicional (corredor / productor), mismo flujo que la pasarela. */
export class CrearIntermediarioDto {
  @ApiProperty({ example: 'J', enum: ['V', 'E', 'J', 'G', 'P'], description: 'Tipo de documento' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['V', 'E', 'J', 'G', 'P'])
  icedula!: string;

  @ApiProperty({ example: '401234567', description: 'Cédula o RIF (solo dígitos)' })
  @Transform(({ value }) => String(value ?? '').replace(/\D/g, ''))
  @Matches(/^\d{1,13}$/, { message: 'cci_rif debe tener entre 1 y 13 dígitos' })
  cci_rif!: string;

  @ApiProperty({ example: 'CORRETAJE EJEMPLO, C.A.', description: 'Nombre completo o razón social' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  xcliente!: string;

  @ApiPropertyOptional({ description: 'Nombres (persona natural)' })
  @Transform(recortar)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  xnombre?: string;

  @ApiPropertyOptional({ description: 'Apellidos (persona natural)' })
  @Transform(recortar)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  xapellido?: string;

  @ApiProperty({ example: 'contacto@corretaje.com', description: 'Correo; también es el usuario web (seusuariosweb.xlogin, máx. 50)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(50, { message: 'xcorreo admite hasta 50 caracteres (es el usuario de login)' })
  xcorreo!: string;

  @ApiProperty({ example: '04141234567' })
  @Transform(({ value }) => String(value ?? '').replace(/\D/g, ''))
  @Matches(/^\d{1,20}$/, { message: 'xtelefono debe tener solo dígitos' })
  xtelefono!: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @Transform(recortar)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  xdireccion?: string;

  @ApiPropertyOptional({ example: 1, description: 'Sucursal (masucur.csucur)' })
  @IsOptional()
  @IsInt()
  csucur?: number;

  @ApiPropertyOptional({ example: 2, enum: [1, 2, 3], description: '1 Agente exclusivo · 2 Corredor · 3 Sociedad de corretaje' })
  @IsOptional()
  @IsIn([1, 2, 3])
  ctipoprod?: number;

  @ApiPropertyOptional({ example: '80123', description: 'Código de intermediario; si se omite se asigna el siguiente libre' })
  @Transform(({ value }) => (value === '' || value == null ? undefined : String(value).replace(/\D/g, '')))
  @IsOptional()
  @Matches(/^\d{1,11}$/, { message: 'cproductor debe tener solo dígitos' })
  cproductor?: string;
}
