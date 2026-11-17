import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { CuentaBancariaDto, normalizarTelefonoVenezuela, TELEFONO_VENEZUELA } from './crear-intermediario.dto';

/** Datos del intermediario que se pueden cambiar después del alta: contacto y cuentas bancarias. */
export class EditarIntermediarioDto {
  @ApiProperty({ example: 'contacto@corretaje.com', description: 'Correo; si cambia, también cambia el usuario web (seusuariosweb.xlogin)' })
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

  @ApiPropertyOptional({ maxLength: 60, description: 'Si se omite no se cambia' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(60)
  xdireccion?: string;

  @ApiPropertyOptional({
    type: [CuentaBancariaDto],
    description: 'Reemplaza las cuentas de maproduc (cuenta 1 y 2); la primera es la cuenta de pago. Si se omite no se cambian.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => CuentaBancariaDto)
  cuentas?: CuentaBancariaDto[];
}
