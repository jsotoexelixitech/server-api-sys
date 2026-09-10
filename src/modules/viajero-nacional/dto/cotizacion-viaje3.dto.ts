import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AseguradoViaje3Dto {
  @ApiProperty({ example: 1, description: 'Parentesco (1 = titular).' })
  @IsInt()
  @Min(0)
  cparen: number;

  @ApiProperty({ example: '14484939', description: 'Cédula/RIF solo dígitos.' })
  @IsString()
  @IsNotEmpty()
  xrif_asegurado: string;

  @ApiProperty({ example: 35 })
  @IsInt()
  @Min(0)
  nedad_asegurado: number;
}

/** Cotización VIAJE3: cramo/cplan/ndias van fijos en el servicio. */
export class CotizacionViaje3Dto {
  @ApiPropertyOptional({ example: '2026-09-04' })
  @IsOptional()
  @IsDateString()
  fdesde?: string;

  @ApiPropertyOptional({
    example: '2026-09-06',
    description: 'Fin inclusive. Si se omite se calcula fdesde + 2.',
  })
  @IsOptional()
  @IsDateString()
  fhasta?: string;

  @ApiProperty({ type: [AseguradoViaje3Dto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @ValidateNested({ each: true })
  @Type(() => AseguradoViaje3Dto)
  asegurados: AseguradoViaje3Dto[];
}
