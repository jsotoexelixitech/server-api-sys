import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class GetVigenciasDto {
  @ApiPropertyOptional({
    example: 'E',
    description: 'Tipo de placa (mavigencias_PR.iplaca). E = extranjera (vigencias cortas prorrateadas).',
  })
  @IsOptional()
  @IsIn(['N', 'E', 'B'])
  iplaca?: string;
}
