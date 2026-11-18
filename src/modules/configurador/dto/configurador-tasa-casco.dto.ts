import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { ALCANCES, MOVIMIENTOS, ORIGENES } from '../configurador-tasa-casco';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Filtros del ajuste con los nombres que lee sp_tarifa_casco_validar_ajuste. Cada alcance acepta solo los suyos. */
export class FiltrosCascoDto {
  @ApiPropertyOptional({ type: [Number], description: 'TIPO_VEHICULO: tipos (> 0).' })
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) vehicleTypes?: number[];
  @ApiPropertyOptional({ type: [String], description: "COBERTURA: coberturas (p. ej. '1', '2', '28')." })
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(4, { each: true }) coverages?: string[];
  @ApiPropertyOptional({ type: [Number], description: 'SUMA_ASEGURADA / COMBINADA: rangos (crango).' })
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(255, { each: true }) ranges?: number[];
  @ApiPropertyOptional({ description: 'ANTIGUEDAD / COMBINADA: desde (-1 a 20).' })
  @IsOptional() @IsInt() @Min(-1) @Max(20) ageFrom?: number;
  @ApiPropertyOptional({ description: 'ANTIGUEDAD / COMBINADA: hasta (-1 a 20).' })
  @IsOptional() @IsInt() @Min(-1) @Max(20) ageTo?: number;
}

/** Vista previa de un ajuste (sp_tarifa_casco_vista_previa; no escribe). */
export class VistaPreviaCascoDto {
  @ApiProperty({ enum: MOVIMIENTOS }) @IsIn(MOVIMIENTOS as unknown as string[]) movimiento: string;
  @ApiProperty({ example: 5, description: '% del ajuste (> 0 y ≤ 100).' }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100) porcentaje: number;
  @ApiProperty({ enum: ALCANCES }) @IsIn(ALCANCES as unknown as string[]) alcance: string;
  @ApiPropertyOptional({ type: FiltrosCascoDto }) @IsOptional() @ValidateNested() @Type(() => FiltrosCascoDto) filtros?: FiltrosCascoDto;
  @ApiPropertyOptional({ description: 'Acota solo el detalle (no el resumen).' }) @IsOptional() @IsInt() tipo_vehiculo?: number;
  @ApiPropertyOptional({ description: 'Acota solo el detalle (no el resumen).' }) @IsOptional() @IsString() @MaxLength(4) cobertura?: string;
}

/** Usuario Sis2000 (seusuariosweb.cusuario) que propone, aprueba o cancela: el SP valida su permiso (TARIFACASCO_ROL). */
class UsuarioCascoDto {
  @ApiProperty({ example: 28002498, description: 'cusuario de seusuariosweb con permiso PROPONER/APROBAR (macatvalores TARIFACASCO_ROL).' })
  @Type(() => Number) @IsInt() @Min(1) cusuario: number;
}

/** Propuesta nueva: AJUSTE (sp_tarifa_casco_ajustar) o RESTAURACION (sp_tarifa_casco_restaurar). */
export class CrearVersionCascoDto extends UsuarioCascoDto {
  @ApiProperty({ enum: ORIGENES }) @IsIn(ORIGENES as unknown as string[]) origen: (typeof ORIGENES)[number];
  @ApiPropertyOptional({ enum: MOVIMIENTOS }) @IsOptional() @IsIn(MOVIMIENTOS as unknown as string[]) movimiento?: string;
  @ApiPropertyOptional({ example: 5 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100) porcentaje?: number;
  @ApiPropertyOptional({ enum: ALCANCES }) @IsOptional() @IsIn(ALCANCES as unknown as string[]) alcance?: string;
  @ApiPropertyOptional({ type: FiltrosCascoDto }) @IsOptional() @ValidateNested() @Type(() => FiltrosCascoDto) filtros?: FiltrosCascoDto;
  @ApiPropertyOptional({ description: 'RESTAURACION: id de la versión APLICADA a restaurar.' }) @IsOptional() @IsInt() @Min(1) version_id?: number;
  @ApiPropertyOptional({ example: '2026-12-01', description: 'Rige desde (obligatoria si no rige al aprobarse).' })
  @IsOptional() @IsISO8601({ strict: true }) vigente_desde?: string;
  @ApiPropertyOptional({ example: '2027-03-31', description: 'Último día en que rige (opcional).' })
  @IsOptional() @IsISO8601({ strict: true }) vigente_hasta?: string;
  @ApiPropertyOptional({ default: false, description: 'true = rige el día en que se aprueba.' }) @IsOptional() @IsBoolean() rige_al_aprobar?: boolean;
  @ApiProperty({ description: 'Motivo (mínimo 10 caracteres).' }) @Transform(recortar) @IsString() @MinLength(10) @MaxLength(500) motivo: string;
}

/** Aprobar (publicar) o rechazar una propuesta PENDIENTE (sp_tarifa_casco_revisar). */
export class RevisarVersionCascoDto extends UsuarioCascoDto {
  @ApiPropertyOptional({ description: 'Comentario (obligatorio al rechazar, mínimo 5 caracteres).' })
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(500) comentario?: string;
}

/** Cancelar una versión APROBADA aún no aplicada (sp_tarifa_casco_cancelar). */
export class CancelarVersionCascoDto extends UsuarioCascoDto {
  @ApiProperty({ description: 'Motivo (mínimo 10 caracteres).' }) @Transform(recortar) @IsString() @MinLength(10) @MaxLength(500) motivo: string;
}
