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
    example: 'N',
    description: 'Indicador de placa nacional (B = nacional)',
  })
  @IsOptional()
  @IsString()
  iplaca?: string;

  @ApiPropertyOptional({ example: '001', description: 'Código de ítem' })
  @IsOptional()
  @IsString()
  citem?: string;

  @ApiPropertyOptional({
    example: 'G',
    description: 'Código de entidad (G = general)',
  })
  @IsOptional()
  @IsString()
  centidad?: string;
}
