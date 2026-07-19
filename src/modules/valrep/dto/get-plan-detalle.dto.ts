import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Body para spBuscaDetallePlan. */
export class GetPlanDetalleDto {
  @ApiProperty({ example: '000101' })
  @IsString()
  cplan!: string;

  @ApiPropertyOptional({ example: 5, description: 'Ramo del plan (vida=5, funerario=9, etc.)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  cramo?: number;
}
