import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GetCitiesDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Código del estado para filtrar ciudades. Si se omite devuelve todas.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cestado?: number;

  @ApiPropertyOptional({
    example: 58,
    description: 'País (mapaises.cpais). Default 58 = Venezuela; 57 = Colombia (placa extranjera).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cpais?: number;
}
