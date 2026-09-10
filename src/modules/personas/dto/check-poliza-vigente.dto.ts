import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';

export class CheckPolizaVigenteDto {
  @ApiProperty({ example: 25221952, description: 'Cédula/RIF numérico del asegurado' })
  @IsNotEmpty()
  rif: number | string;

  @ApiPropertyOptional({ example: 9, description: 'Ramo (9 = funerario). Por defecto 9.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  cramo?: number;
}
