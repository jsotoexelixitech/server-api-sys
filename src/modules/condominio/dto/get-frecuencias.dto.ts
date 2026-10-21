import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class GetFrecuenciasDto {
  @ApiPropertyOptional({ example: 38, description: 'Código de ramo (38 = Hogar, 16 = Condominio). Se usa junto con cplan.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cramo?: number;

  @ApiPropertyOptional({ example: 'RESIDE', description: 'Código del plan (maplanes.cplan). Sin él se devuelve el catálogo general de frecuencias.' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  cplan?: string;

  @ApiPropertyOptional({ example: 80080, description: 'Productor (maproduc.cproductor). Suma las frecuencias de maplanes_frec_produc.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cproductor?: number;
}
