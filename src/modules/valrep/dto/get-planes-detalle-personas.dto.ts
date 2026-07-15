import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/** Body para POST /valrep/planes/detalle (funerario — spBuscaDetallePlan). */
export class GetPlanesDetallePersonasDto {
  @ApiProperty({ example: 9, description: 'Ramo del plan (9 = Funerario).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cramo: number;

  @ApiProperty({ example: '4', description: 'Código del plan (de planes/producto).' })
  @IsString()
  @IsNotEmpty()
  cplan: string;
}
