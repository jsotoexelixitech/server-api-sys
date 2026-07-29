import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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

  @ApiProperty({
    example: 'M',
    description: 'Frecuencia de pago. Viajero prorrata: usar E (única).',
    enum: ['A', 'S', 'T', 'M', 'E', 'C'],
  })
  @IsIn(['A', 'S', 'T', 'M', 'E', 'C'])
  ifrecuencia: string;

  @ApiPropertyOptional({ example: '2026-07-29', description: 'Inicio vigencia (viajero prorrata).' })
  @IsOptional()
  @IsDateString()
  fdesde?: string;

  @ApiPropertyOptional({ example: '2026-08-02', description: 'Fin vigencia inclusive (viajero prorrata).' })
  @IsOptional()
  @IsDateString()
  fhasta?: string;

  @ApiPropertyOptional({ example: 5, description: 'Días de vigencia (alternativa a fdesde/fhasta).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  ndias?: number;

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
