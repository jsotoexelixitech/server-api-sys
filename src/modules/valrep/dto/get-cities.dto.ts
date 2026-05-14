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
}
