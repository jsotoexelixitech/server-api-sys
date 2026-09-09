import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertAseguradoraDto {
  @ApiPropertyOptional({ example: 'MUNDIAL' })
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiPropertyOptional({ example: 'La Mundial de Seguros' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ example: 'mssql', default: 'mssql' })
  @IsOptional()
  @IsString()
  tipoDb?: string;

  @ApiPropertyOptional({ name: 'tipo_db' })
  @IsOptional()
  @IsString()
  tipo_db?: string;

  @ApiPropertyOptional({ example: '192.168.1.10' })
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional({ example: 1433 })
  @IsOptional()
  @IsNumber()
  port?: number;

  @ApiPropertyOptional({ example: 'Sis2000' })
  @IsOptional()
  @IsString()
  databaseName?: string;

  @ApiPropertyOptional({ name: 'database_name' })
  @IsOptional()
  @IsString()
  database_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schemaOrigen?: string | null;

  @ApiPropertyOptional({ name: 'schema_origen' })
  @IsOptional()
  @IsString()
  schema_origen?: string | null;

  @ApiPropertyOptional({ example: 'GENERIC', default: 'GENERIC' })
  @IsOptional()
  @IsString()
  adapterCodigo?: string;

  @ApiPropertyOptional({ name: 'adapter_codigo' })
  @IsOptional()
  @IsString()
  adapter_codigo?: string;

  @ApiPropertyOptional({
    description: 'Configuración origen por entidad (JSONB)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  origenConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ name: 'origen_config' })
  @IsOptional()
  origen_config?: Record<string, unknown> | string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/** Campos requeridos validados en servicio (normalize + validatePayload). */
export class CreateAseguradoraDto extends UpsertAseguradoraDto {}

export class ProvisionAseguradoraDto extends CreateAseguradoraDto {}
