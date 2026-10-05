import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class GetPlanesV2Dto {
  @ApiProperty({ example: 6, description: 'Código de ramo' })
  @IsInt()
  @Min(1)
  cramo: number;

  @ApiProperty({ example: 12345, description: 'Código de productor' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  cproductor: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Tipo de vehículo. Solo requerido para ramo automóvil (cramo=18). 1=Particular, 2=Rústico, 3=Carga, etc.',
  })
  @IsOptional()
  @IsNumber()
  ctipo?: number;

  @ApiProperty({ example: '355', description: 'Código de usuario' })
  @IsString()
  @IsNotEmpty()
  cusuario: string;

  @ApiPropertyOptional({
    example: 'B',
    description: 'Indicador de placa: N=nacional, E=extranjera, B=binacional (activa bnacional en spBuscaPlan).',
  })
  @IsOptional()
  @IsString()
  iplaca?: string;

  @ApiPropertyOptional({ example: '001', description: 'Código de ítem' })
  @IsOptional()
  @IsString()
  citem?: string;

  @ApiPropertyOptional({
    example: 'P',
    description: 'Entidad del actor (P=productor, C=canal, G=global). Requerida con csubitem.',
  })
  @IsOptional()
  @IsString()
  centidad?: string;

  @ApiPropertyOptional({
    example: '80080',
    description:
      'Código gestor/sub-ítem (mausuplan.citem) para excluir planes restringidos al usuario. Requiere centidad.',
  })
  @IsOptional()
  @IsString()
  csubitem?: string;

  @ApiPropertyOptional({
    example: '57',
    description:
      'Código producto Sis2000. Obligatorio cuando cramo !== 18 y se envía csubitem (exclusión por gestor).',
  })
  @IsOptional()
  @IsString()
  cproducto?: string;
}
