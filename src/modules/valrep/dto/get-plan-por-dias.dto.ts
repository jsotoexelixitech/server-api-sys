import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Resuelve plan en maplanes_frec por vigencia en días (viajero local, etc.). */
export class GetPlanPorDiasDto {
  @ApiProperty({ example: 5, description: 'Ramo del producto' })
  @IsInt()
  @Min(1)
  cramo!: number;

  @ApiProperty({ example: 3, description: 'Días de vigencia (ej. plan viajero 3 días)' })
  @IsInt()
  @Min(1)
  ndias!: number;
}
