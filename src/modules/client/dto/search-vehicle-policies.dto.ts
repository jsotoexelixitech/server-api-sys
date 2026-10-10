import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { LIMIT_DEFAULT, LIMIT_MAX, normalizarPlaca } from '../vehicle-policy-search';

export class SearchVehiclePoliciesDto {
  @ApiPropertyOptional({ example: 'AB385WR', description: 'Placa del vehículo (se normaliza a mayúsculas sin símbolos)' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Transform(({ value }) => (typeof value === 'string' ? normalizarPlaca(value) : value))
  @Matches(/^[A-Z0-9]{3,15}$/, { message: 'placa inválida' })
  placa?: string;

  @ApiPropertyOptional({ example: 12345678, description: 'Cédula o RIF numérico del asegurado o tomador' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  cci_rif?: number;

  @ApiPropertyOptional({
    example: 'TOYOTA',
    description: 'Marca (prefijo). Solo se acepta junto con `cproductor`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string;

  @ApiPropertyOptional({ example: 80080, description: 'Código de productor: limita la búsqueda a su cartera' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  cproductor?: number;

  @ApiPropertyOptional({ default: LIMIT_DEFAULT, maximum: LIMIT_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMIT_MAX)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
