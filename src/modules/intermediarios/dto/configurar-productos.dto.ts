import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';

export class PlanProductoDto {
  @ApiProperty({ example: '501' })
  @Transform(({ value }) => (value === null || value === undefined ? '' : String(value).trim()))
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  cplan!: string;

  @ApiProperty({ example: 18 })
  @Type(() => Number)
  @IsInt()
  cramo!: number;
}

export class ProductoPlanesDto {
  @ApiProperty({ example: '24', description: 'maproductos.cproducto' })
  @Transform(({ value }) => (value === null || value === undefined ? '' : String(value).trim()))
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  cproducto!: string;

  @ApiProperty({ type: [PlanProductoDto], description: 'Planes del producto que tendrá el intermediario' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanProductoDto)
  planes!: PlanProductoDto[];
}

/**
 * Productos y planes del intermediario (como products/configureProducts de SysIP).
 * Los productos que no vienen quedan sin planes para el intermediario.
 */
export class ConfigurarProductosDto {
  @ApiProperty({ type: [ProductoPlanesDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductoPlanesDto)
  productos!: ProductoPlanesDto[];
}
