import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsString, Matches, MaxLength, Min } from 'class-validator';
import { normalizarPlacaContacto, PLACA_RE } from '../titular-contacto';

export class SearchTitularContactoDto {
  @ApiProperty({ example: 12345678, description: 'Cédula o RIF numérico del titular' })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  cci_rif: number;

  @ApiProperty({ example: 'AB385WR', description: 'Placa del vehículo (se normaliza)' })
  @IsString()
  @MaxLength(15)
  @Transform(({ value }) => (typeof value === 'string' ? normalizarPlacaContacto(value) : value))
  @Matches(PLACA_RE, { message: 'placa inválida' })
  placa: string;
}
