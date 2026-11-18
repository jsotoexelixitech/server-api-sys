import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const mayuscula = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

/** Alta de una frecuencia del plan (maplanes_frec). */
export class FrecuenciaPlanDto {
  @ApiProperty({ example: 'M', description: 'Letra A/S/T/C/M/E/K/D (se guarda en mayúscula).' })
  @Transform(mayuscula)
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  ifrecuencia: string;

  @ApiPropertyOptional({ example: 'MENSUAL', description: 'Descripción (máx. 150). Por defecto la de la letra; en D, «Hasta N días».' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(150)
  xfrecuencia?: string;

  @ApiPropertyOptional({ example: 7, description: 'Días. Obligatorio (≠ 0) en D; -30 = «más de 30 días». También lo usan A y E.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ndias?: number | null;

  @ApiPropertyOptional({ example: 'D', description: 'maplanes_frec.itipo (una letra; en los datos solo D o vacío).' })
  @IsOptional()
  @Transform(mayuscula)
  @IsString()
  @MaxLength(1)
  itipo?: string | null;
}

/** Edición de una frecuencia del plan: la letra va en la ruta; ndias identifica la fila si hay varias. */
export class EditarFrecuenciaPlanDto {
  @ApiPropertyOptional({ example: 7, description: 'Identifica la fila (llave: letra + ndias, NULL = 0) cuando la letra tiene varias.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ndias?: number | null;

  @ApiPropertyOptional({ example: 'MENSUAL', description: 'Nueva descripción (máx. 150).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(150)
  xfrecuencia?: string;

  @ApiPropertyOptional({ example: 15, description: 'Nuevo ndias (null = sin días). Cambia la llave lógica: 409 si ya hay otra fila V con esa llave.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ndiasNuevo?: number | null;

  @ApiPropertyOptional({ enum: ['V', 'I'], description: "V = vigente, I = inactiva. 409 si al reactivar quedarían dos 'V' con la misma llave." })
  @IsOptional()
  @Transform(mayuscula)
  @IsIn(['V', 'I'])
  iestado?: 'V' | 'I';
}

/** Alta de una frecuencia propia de un productor (maplanes_frec_produc). */
export class FrecuenciaProductorDto extends FrecuenciaPlanDto {
  @ApiProperty({ example: 628, description: 'Productor (maproduc.cproductor).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cproductor: number;
}

/** Baja de frecuencias de un productor: ndias opcional para borrar solo esa fila. */
export class BajaFrecuenciaProductorQueryDto {
  @ApiPropertyOptional({ example: 7, description: 'Si viene, borra solo la fila con ese ndias (NULL = 0); si no, todas las de la letra.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ndias?: number;
}
