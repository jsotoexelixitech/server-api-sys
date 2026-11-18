import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Llave de una fila de maarancel dentro del plan (sin cplan ni cramo, que van en la ruta). */
export class LlaveComisionDto {
  @ApiProperty({ example: 0, description: 'Tipo de productor (maarancel.ctipoprod).' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(32767)
  ctipoprod: number;

  @ApiProperty({ example: 0, description: 'Productor (0 = todos).' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cproductor: number;

  @ApiProperty({ example: '0', description: "Cobertura ('0' = todas)." })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccober: string;

  @ApiProperty({ example: '0', description: "Tarifa ('0' = todas)." })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ctarifa: string;

  @ApiProperty({ example: '2026-01-01', description: 'Vigencia desde (parte de la PK).' })
  @Matches(FECHA)
  fdesde: string;
}

export class ComisionPlanDto extends LlaveComisionDto {
  @ApiProperty({ example: 15, description: 'Comisión en % (0 a 100, 2 decimales).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pcomision: number;
}

export class BajaComisionPlanDto extends LlaveComisionDto {
  @ApiProperty({ example: '2026-11-30', description: 'Último día vigente.' })
  @Matches(FECHA)
  fhasta: string;
}
