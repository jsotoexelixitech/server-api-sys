import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Open filtros / payload objects from ET (no fixed shape). */
export class FiltrosOpenDto {
  [key: string]: unknown;
}

export class NombreInternoParamDto {
  @ApiProperty({ example: 'RPT_RECIBOS' })
  @IsString()
  @MinLength(1)
  nombreInterno!: string;
}

export class CcampoParamDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  ccampo!: number;
}

export class CesquemaParamDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  cesquema!: number;
}

export class CcampoUpdateParamDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  ccampo!: number;
}

export class CusuarioQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number;
}

export class ExportQueryDto extends CusuarioQueryDto {
  @ApiPropertyOptional({ description: 'Si true, retorna preview JSON en lugar del archivo' })
  @IsOptional()
  preview?: boolean | string;
}

export class GraficoExecuteDto {
  @ApiProperty()
  @IsString()
  id_grafico!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xtitulo_ui?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xcampo_dimension?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xcampo_metrica?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ioperacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itipo_grafico?: string;

  [key: string]: unknown;
}

export class ExecuteReportDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  filtros?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  kpis?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [GraficoExecuteDto] })
  @IsOptional()
  @IsArray()
  graficos?: GraficoExecuteDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number;

  [key: string]: unknown;
}

export class ExportDataDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  filtros?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'XLSX' })
  @IsOptional()
  @IsString()
  formato?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number;

  [key: string]: unknown;
}

export class SaveSchemaDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  filtros?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number;

  [key: string]: unknown;
}

export class InsightsDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  filtros?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  grid?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  kpis?: Record<string, unknown>[] | Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  graphics?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  [key: string]: unknown;
}

export class ConfiguracionBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  kpis?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  graficos?: Record<string, unknown>[];

  [key: string]: unknown;
}

export class VistaConfiguracionDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  xnombre_vista!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bpor_defecto?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  configuracion?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number;

  [key: string]: unknown;
}

export class DeleteVistaParamDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  nombreInterno!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cconfiguracion!: number;
}

export class GuardarCampoDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  cesquema!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cpadre?: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  xnombre_param!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  xetiqueta!: string;

  @ApiProperty()
  @IsString()
  itipo_control!: string;

  @ApiProperty()
  @IsString()
  itipo_dato!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  norden!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  nancho_grid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  noffset_grid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xicono?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bobligatorio?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  boculto?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bsolo_lectura?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xvalor_minimo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xvalor_maximo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  npaso?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bdesde_query?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xsp_lista?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xlista_valores?: string;

  [key: string]: unknown;
}

export class GuardarMetadataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cesquema?: number;

  @ApiProperty()
  @IsString()
  itipo!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  xnombre_interno!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  xtitulo_ui!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xdescripcion?: string;

  @ApiPropertyOptional({ default: 'ES' })
  @IsOptional()
  @IsString()
  icomportamiento?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iformato_reporte?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xdelimitador?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xnombre_archivo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xsp_lectura?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  xsp_escritura?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bactivo?: boolean;

  [key: string]: unknown;
}

export class ListBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cusuario?: number;

  [key: string]: unknown;
}
