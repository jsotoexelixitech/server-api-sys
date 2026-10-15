import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Desplegable del menú lateral (semenuprincipal). */
export class GuardarPrincipalDto {
  @ApiProperty({ example: 'Reportería', description: 'Nombre del desplegable (máx. 50)' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  xmenu!: string;

  @ApiPropertyOptional({ example: 'cilChartLine', description: 'Icono CoreUI (si se omite, el front usa el suyo)' })
  @Transform(recortar)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  xicono?: string;

  @ApiPropertyOptional({ example: '/reports', description: 'Ruta base del desplegable' })
  @Transform(recortar)
  @IsOptional()
  @IsString()
  @MaxLength(250)
  xruta?: string;

  @ApiPropertyOptional({ enum: ['V', 'I'], default: 'V', description: 'V activo · I inactivo' })
  @IsOptional()
  @IsIn(['V', 'I'])
  istatus?: 'V' | 'I';
}

/** Opción dentro de un desplegable (semenu). */
export class GuardarOpcionDto {
  @ApiProperty({ example: 7, description: 'cmenu_principal del desplegable' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cmenu_principal!: number;

  @ApiProperty({ example: 'Reporte de desempeño', description: 'Nombre de la opción (máx. 100)' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  xmenu!: string;

  @ApiProperty({ example: '/reports/kpi-comparativo', description: 'Ruta de Angular que abre la opción' })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  xruta!: string;

  @ApiPropertyOptional({ enum: ['V', 'I'], default: 'V' })
  @IsOptional()
  @IsIn(['V', 'I'])
  istatus?: 'V' | 'I';
}

export class ItemPlantillaDto {
  @ApiProperty({ example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cmenuprincipal!: number;

  @ApiPropertyOptional({ example: 90, nullable: true, description: 'null = solo el desplegable' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cmenu?: number | null;
}

/** Permisos de menú de un departamento + rol (o de un usuario puntual). */
export class GuardarPlantillaDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  cdepartamento!: number;

  @ApiProperty({ example: 6 })
  @Type(() => Number)
  @IsInt()
  crol!: number;

  @ApiPropertyOptional({ example: null, description: 'Plantilla propia de un usuario (si se omite, la del rol)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number | null;

  @ApiProperty({ type: [ItemPlantillaDto], description: 'Opciones que verá el rol (las no listadas se quitan)' })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ItemPlantillaDto)
  menus!: ItemPlantillaDto[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Plantilla de rol: false (por defecto) solo la toman los usuarios nuevos; true rehace también el menú de los usuarios existentes del rol',
  })
  @IsOptional()
  @IsBoolean()
  aplicarAExistentes?: boolean;
}
