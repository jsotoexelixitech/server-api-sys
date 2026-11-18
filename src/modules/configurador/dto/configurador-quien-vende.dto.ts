import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

const mayuscula = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
/** Acepta números o textos en items (los códigos de productor y canal suelen venir como número). */
const itemsTexto = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (v == null ? v : String(v).trim())) : value;

/** Alta o baja en mausuplan. items null = «todos» de esa entidad (fila con citem NULL). */
export class QuienVendeDto {
  @ApiProperty({ enum: ['P', 'C', 'G'], description: 'P = productor, C = canal, G = gestor (R/U/A no se editan).' })
  @Transform(mayuscula)
  @IsIn(['P', 'C', 'G'])
  centidad: 'P' | 'C' | 'G';

  @ApiProperty({ enum: ['A', 'E'], description: 'A = incluye, E = excluye.' })
  @Transform(mayuscula)
  @IsIn(['A', 'E'])
  itipouso: 'A' | 'E';

  @ApiProperty({
    type: [String], nullable: true, example: ['80080', '628'],
    description: 'Códigos (cproductor, ccanalalt o cgestor). null = todos (en baja: borra la fila «todos»). Obligatorio.',
  })
  @Transform(itemsTexto)
  @ValidateIf((o: QuienVendeDto) => o.items !== null)
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  items: string[] | null;
}

export class QuienVendeQueryDto {
  @ApiPropertyOptional({ enum: ['P', 'C', 'G', 'R', 'U', 'A'] })
  @IsOptional()
  @Transform(mayuscula)
  @IsIn(['P', 'C', 'G', 'R', 'U', 'A'])
  centidad?: string;

  @ApiPropertyOptional({ enum: ['A', 'E'] })
  @IsOptional()
  @Transform(mayuscula)
  @IsIn(['A', 'E'])
  itipouso?: string;

  @ApiPropertyOptional({ description: 'Busca en el código (citem) o el nombre de la entidad.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ default: 50, description: 'Filas por página (máx. 500).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
