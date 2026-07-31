import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class GetPlanesCondominioDto {
  @ApiPropertyOptional({ example: 38, description: 'Código de ramo (38 = Condominio Residencial). Por defecto 38.' })
  @IsOptional()
  @IsInt()
  cramo?: number;

  @ApiPropertyOptional({ example: 'RESIDE', description: 'Código del plan (opcional).' })
  @IsOptional()
  @IsString()
  cplan?: string;
}
