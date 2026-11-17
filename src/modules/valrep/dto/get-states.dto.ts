import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GetStatesDto {
  @ApiPropertyOptional({
    example: 58,
    description: 'País (mapaises.cpais). Default 58 = Venezuela; 57 = Colombia (placa extranjera).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cpais?: number;
}
