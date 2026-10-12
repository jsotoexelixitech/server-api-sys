import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SearchCiudadesDto {
  @ApiProperty({ example: 24, description: 'Código del estado (cestado de maestados)' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  cestado: number;
}
