import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class GetByRamoDto {
  @ApiProperty({ example: 38, description: 'Código de ramo (ej. 38 = Hogar, 16 = Condominio, 28 = Vecinos).' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  cramo: number;
}
