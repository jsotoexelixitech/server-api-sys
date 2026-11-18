import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CrearProductoDto } from './configurador.dto';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Campos que el alta agrega con el UPDATE posterior a sp_CrearProducto. */
export class CrearProductoCompletoDto extends CrearProductoDto {
  @ApiPropertyOptional({ description: 'Lo venden gestores (maproductos.igestor).' })
  @IsOptional()
  @IsBoolean()
  igestor?: boolean;

  @ApiPropertyOptional({ example: 'FORM_RCV', description: 'Formulario (máx. 50).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(50)
  xform?: string;

  @ApiPropertyOptional({ example: '10', description: 'Monto inicial (VARCHAR(20) en Sis2000).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(20)
  mmonto_inicial?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  norden?: number;

  @ApiPropertyOptional({ description: 'Texto de fraccionamiento (máx. 200).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(200)
  xfraccionamiento?: string;

  @ApiPropertyOptional({ description: 'URL de presentación (máx. 200).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(200)
  xurl_presentacion?: string;
}

/** Edición de un producto: solo los campos enviados; cramo identifica la fila (no se cambia). null vacía el campo. */
export class EditarProductoDto {
  @ApiProperty({ example: 28, description: 'Ramo del producto (identifica la fila; no se cambia).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  cramo: number;

  @ApiPropertyOptional({ description: 'Nombre (máx. 60, no vacío).' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(60)
  xdescripcion_l?: string;

  @ApiPropertyOptional({ description: 'Nombre corto (máx. 15).', nullable: true })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(15)
  xdescripcion_c?: string | null;

  @ApiPropertyOptional({ description: 'Abreviatura (máx. 5).', nullable: true })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(5)
  xabreviatura?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  iproductor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  icanal?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  igestor?: boolean;

  @ApiPropertyOptional({ description: 'Formulario (máx. 50).', nullable: true })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(50)
  xform?: string | null;

  @ApiPropertyOptional({ description: 'Descripción comercial (máx. 150).', nullable: true })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(150)
  xdescripcion_prod?: string | null;

  @ApiPropertyOptional({ description: 'Monto inicial (VARCHAR(20)).', nullable: true })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(20)
  mmonto_inicial?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  norden?: number | null;

  @ApiPropertyOptional({ description: 'Máx. 200.', nullable: true })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(200)
  xfraccionamiento?: string | null;

  @ApiPropertyOptional({ description: 'Máx. 200.', nullable: true })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(200)
  xurl_presentacion?: string | null;
}
