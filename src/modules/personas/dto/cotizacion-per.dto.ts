import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AseguradoPerDto {
  @ApiProperty({ example: 1, description: 'Código de parentesco (1=Titular, 2=Cónyuge…).' })
  @IsInt()
  @Min(0)
  cparen: number;

  @ApiProperty({ example: '25221952', description: 'RIF/cédula del asegurado (solo dígitos).' })
  @IsString()
  @IsNotEmpty()
  xrif_asegurado: string;

  @ApiProperty({ example: 35, description: 'Edad del asegurado (años cumplidos).' })
  @IsInt()
  @Min(0)
  nedad_asegurado: number;
}

export class CotizacionPerDto {
  @ApiPropertyOptional({ example: 9, description: 'Código de ramo (9 = Funerario). Por defecto 9.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  cramo?: number;

  @ApiProperty({ example: 'FUNBAS', description: 'Código del plan funerario.' })
  @IsString()
  @IsNotEmpty()
  cplan: string;

  @ApiProperty({ example: 'M', description: 'Frecuencia de pago.', enum: ['A', 'S', 'T', 'M'] })
  @IsIn(['A', 'S', 'T', 'M'])
  ifrecuencia: string;

  @ApiProperty({ type: [AseguradoPerDto], description: 'Lista de asegurados a cotizar.' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AseguradoPerDto)
  asegurados: AseguradoPerDto[];

  @ApiPropertyOptional({ example: null, description: 'Suma asegurada (opcional, según plan).' })
  @IsOptional()
  @IsNumber()
  msumaaseg?: number | null;

  @ApiPropertyOptional({ example: null, description: 'Tasa de cambio Bs/USD (opcional; si no se envía se lee de mamonedas).' })
  @IsOptional()
  @IsNumber()
  ptasamon?: number | null;
}
