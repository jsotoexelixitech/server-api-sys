import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';

/** Ramos con tarifa por cobertura en matarifa_d: 16 = Combinado Empresarial, 38 = Combinado Residencial. */
export const RAMOS_COBERTURAS = [16, 38] as const;

export class TarifaPlanDto {
  @ApiProperty({ example: 38 })
  @Type(() => Number)
  @IsIn(RAMOS_COBERTURAS as unknown as number[])
  cramo: number;

  @ApiProperty({ example: '2' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  cplan: string;
}

export class CoberturaPedidaDto {
  @ApiProperty({ example: '1', description: 'Código de cobertura (macoberturas.ccobertura).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccober: string;

  @ApiProperty({ example: 140000, description: 'Suma asegurada de la cobertura en la moneda del plan.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  suma: number;
}

export class CotizarCoberturasDto extends TarifaPlanDto {
  @ApiProperty({ type: [CoberturaPedidaDto], description: 'Coberturas elegidas con su suma. La básica es obligatoria.' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CoberturaPedidaDto)
  coberturas: CoberturaPedidaDto[];
}

export class PersonaRiesgoDto {
  @ApiProperty({ example: 'V' }) @IsString() @MaxLength(1) tipo_cedula: string;
  @ApiProperty({ example: '12345678' }) @IsNotEmpty() rif: string | number;
  @ApiProperty({ example: 'JUAN' }) @IsString() @IsNotEmpty() nombre: string;
  @ApiPropertyOptional({ example: 'PEREZ' }) @IsOptional() @IsString() apellido?: string;
  @ApiPropertyOptional({ example: 'Caracas' }) @IsOptional() @IsString() direccion?: string;
  @ApiPropertyOptional({ example: '04121234567' }) @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional({ example: 'juan@correo.com' }) @IsOptional() @IsString() correo?: string;
}

export class EmitirCoberturasDto extends CotizarCoberturasDto {
  @ApiProperty({ type: PersonaRiesgoDto })
  @ValidateNested()
  @Type(() => PersonaRiesgoDto)
  tomador: PersonaRiesgoDto;

  @ApiPropertyOptional({ type: PersonaRiesgoDto, description: 'Sin asegurado se usa el tomador.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PersonaRiesgoDto)
  asegurado?: PersonaRiesgoDto;

  @ApiProperty({ example: 'Apartamento 5-B, Residencias Los Palos Grandes', description: 'Bien o actividad asegurada (xdescrip1).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  bien: string;

  @ApiProperty({ example: 'Av. Andrés Bello, Los Palos Grandes, Caracas', description: 'Dirección del riesgo.' })
  @IsString()
  @IsNotEmpty()
  direccion_riesgo: string;

  @ApiPropertyOptional({ example: 52, description: 'Ramo 38: número de apartamento o unidad (clave cédula + plan + unidad).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  apartamento?: number;

  @ApiPropertyOptional({ example: 80080 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productor?: number;
}
