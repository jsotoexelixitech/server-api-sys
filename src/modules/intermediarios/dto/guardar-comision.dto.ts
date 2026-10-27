import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const TIPOS_COMISION = ['comision', 'bono', 'gasto'] as const;
export type TipoComision = (typeof TIPOS_COMISION)[number];

/**
 * Comisión (maarancel), bono (mabonos) o gasto de ramo (magastosramo) de un intermediario.
 * Si la fila ya existe (misma clave o mismo código) se actualiza; si no, se crea.
 */
export class GuardarComisionDto {
  @ApiProperty({ enum: TIPOS_COMISION, example: 'comision' })
  @IsIn(TIPOS_COMISION)
  tipo!: TipoComision;

  @ApiProperty({ example: 18, description: 'maramos.cramo' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cramo!: number;

  @ApiPropertyOptional({
    example: '0',
    description: "maplanes.cplan; '0' = todos los planes del ramo",
  })
  @Transform(({ value }) => (value === null || value === undefined || value === '' ? '0' : String(value).trim()))
  @IsOptional()
  @IsString()
  @MaxLength(6)
  cplan?: string;

  @ApiProperty({ example: 10, description: 'Porcentaje (0 < % <= 100)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  porcentaje!: number;

  @ApiPropertyOptional({
    example: 'BONO INCENTIVO CONVENIO',
    description: 'Obligatoria en bono y gasto de ramo',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsString()
  @MaxLength(60)
  descripcion?: string;

  @ApiProperty({ example: '2026-10-19' })
  @IsDateString()
  fdesde!: string;

  @ApiPropertyOptional({
    example: '2046-10-19',
    description: 'Vacío = 20 años desde fdesde (como SpActCreGastosRamo)',
  })
  @IsOptional()
  @IsDateString()
  fhasta?: string;

  @ApiPropertyOptional({
    enum: ['V', 'N'],
    default: 'V',
    description: 'V = vigente, N = inactiva',
  })
  @IsOptional()
  @IsIn(['V', 'N'])
  iestado?: 'V' | 'N';

  @ApiPropertyOptional({
    example: 3,
    description: 'Bono: cbono / gasto: cgastos a actualizar. Vacío = nuevo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  codigo?: number;
}
