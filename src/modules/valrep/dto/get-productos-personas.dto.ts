import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * Body para POST /valrep/productos.
 * Réplica de SysIP valrepController.getProducts (fb_organizacion_swagger).
 * Nota: la ruta SysIP NO usa spBuscaProductosEntidad; usa SQL legacy getProducts.
 */
export class GetProductosPersonasDto {
  @ApiProperty({
    example: '80080',
    description: 'Código de productor o canal (citem).',
  })
  @IsString()
  @IsNotEmpty()
  citem: string;

  @ApiProperty({
    example: 'P',
    description: 'P = productor, C = canal.',
    enum: ['P', 'C'],
  })
  @IsString()
  @IsIn(['P', 'C'])
  centidad: string;
}
