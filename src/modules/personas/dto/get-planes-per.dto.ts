import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GetPlanesPerDto {
  @ApiPropertyOptional({ example: 9, description: 'Código de ramo (9 = Funerario). Por defecto 9.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  cramo?: number;

  @ApiPropertyOptional({ example: null, description: 'Tipo (opcional). Normalmente null para personas.' })
  @IsOptional()
  @IsInt()
  ctipo?: number | null;
}
