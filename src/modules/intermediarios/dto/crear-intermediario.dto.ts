import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

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

/** Cuenta bancaria nacional del intermediario (maproduc.ccuentaban / itipocta). */
export class CuentaBancariaDto {
  @ApiProperty({ example: '01050067211067478957', description: '20 dígitos; los 4 primeros son el banco (mabanco.CBANCO_REF)' })
  @Transform(({ value }) => String(value ?? '').replace(/\D/g, ''))
  @Matches(/^\d{20}$/, { message: 'La cuenta bancaria debe tener 20 dígitos' })
  ccuenta!: string;

  @ApiProperty({ example: 'CO', enum: ['CO', 'AH'], description: 'CO corriente · AH ahorro' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['CO', 'AH'])
  itipocta!: 'CO' | 'AH';
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

  @ApiPropertyOptional({ example: '1985-04-21', description: 'Fecha de nacimiento (persona natural, mayor de 18)' })
  @IsOptional()
  @IsDateString()
  fnacimiento?: string;

  @ApiPropertyOptional({ example: 'M', enum: ['M', 'F'], description: 'Sexo (persona natural): M masculino · F femenino' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsIn(['M', 'F'])
  isexo?: 'M' | 'F';

  @ApiPropertyOptional({
    example: 'S',
    enum: ['S', 'C', 'D', 'V', 'U'],
    description: 'Estado civil (persona natural): S soltero · C casado · D divorciado · V viudo · U unión estable',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsIn(['S', 'C', 'D', 'V', 'U'])
  iestado_civil?: 'S' | 'C' | 'D' | 'V' | 'U';

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

  @ApiPropertyOptional({ type: [CuentaBancariaDto], description: 'Hasta 2 cuentas (maproduc cuenta 1 y 2)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => CuentaBancariaDto)
  cuentas?: CuentaBancariaDto[];

  @ApiPropertyOptional({ example: '80123', description: 'Código de intermediario; si se omite se asigna el siguiente libre' })
  @Transform(({ value }) => (value === '' || value == null ? undefined : String(value).replace(/\D/g, '')))
  @IsOptional()
  @Matches(/^\d{1,11}$/, { message: 'cproductor debe tener solo dígitos' })
  cproductor?: string;
}
