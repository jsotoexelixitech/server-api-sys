import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Teléfono de Venezuela: celular 04XX o fijo 02XX + 7 dígitos (11 en total, con el 0 inicial). */
export const TELEFONO_VENEZUELA = /^0(2\d{2}|4(12|14|16|22|24|26))\d{7}$/;

/** Deja el teléfono como 0XXXXXXXXXX: quita espacios, guiones y paréntesis y convierte +58 / 58 en 0. */
export function normalizarTelefonoVenezuela(valor: unknown): string {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length === 12 && digitos.startsWith('58')) digitos = `0${digitos.slice(2)}`;
  if (digitos.length === 10 && /^[24]/.test(digitos)) digitos = `0${digitos}`;
  return digitos;
}

/** Alta de intermediario tradicional (corredor / productor), mismo flujo que la pasarela. */
export class CrearIntermediarioDto {
  @ApiProperty({ example: 'J', enum: ['V', 'E', 'J', 'G', 'P'], description: 'Tipo de documento' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['V', 'E', 'J', 'G', 'P'])
  icedula!: string;

  @ApiPropertyOptional({
    example: 'J',
    enum: ['N', 'J'],
    description: 'Tipo de ente (maclient.ipersona): N natural (V/E/P) o J jurídica (J/G). Si se omite, sale del documento.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsIn(['N', 'J'])
  ipersona?: 'N' | 'J';

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

  @ApiProperty({ example: '04141234567', description: 'Venezuela: celular 0412/0414/0416/0422/0424/0426 o fijo 02XX + 7 dígitos; acepta +58' })
  @Transform(({ value }) => normalizarTelefonoVenezuela(value))
  @Matches(TELEFONO_VENEZUELA, {
    message: 'xtelefono debe ser un teléfono de Venezuela: 0412/0414/0416/0422/0424/0426 o fijo 02XX, seguido de 7 dígitos',
  })
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
