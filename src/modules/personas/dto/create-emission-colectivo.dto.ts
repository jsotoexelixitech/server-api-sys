import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Tipos de documento que acepta Sis2000 (maclient.icedula). */
export const TIPOS_CEDULA_COLECTIVO = ['V', 'E', 'J', 'G', 'P'] as const;
/** Frecuencias de pago del SP colectivo: anual, semestral, cuatrimestral, trimestral, mensual, especial. */
export const FRECUENCIAS_COLECTIVO = ['A', 'S', 'C', 'T', 'M', 'E'] as const;
/** Tope de titulares por solicitud (el body de esta ruta admite hasta 5 MB). */
export const MAX_TITULARES_COLECTIVO = 5000;
/** Tope de cargas por titular (nasegurado = titular * 1000 + carga). */
export const MAX_CARGAS_POR_TITULAR = 999;

const RIF_MAX = 99_999_999_999;
const RIF_EMPRESA_MAX = 999_999_999;

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** El cotizador manda los textos opcionales vacíos como "" o null: se tratan como ausentes. */
const blankToUndefined = ({ value }: { value: unknown }) =>
  value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value;

/** Carga (dependiente) de un titular. */
export class AseguradoColectivoDto {
  @ApiPropertyOptional({ example: 'V', enum: TIPOS_CEDULA_COLECTIVO, description: 'Tipo de documento. Alias: tipo_cedula_asegurado.' })
  @IsOptional() @Transform(upper) @IsIn(TIPOS_CEDULA_COLECTIVO)
  icedula_asegurado?: string;

  @ApiPropertyOptional({ example: 'V', enum: TIPOS_CEDULA_COLECTIVO, description: 'Alias de icedula_asegurado (nombre que usa el cotizador).' })
  @IsOptional() @Transform(upper) @IsIn(TIPOS_CEDULA_COLECTIVO)
  tipo_cedula_asegurado?: string;

  @ApiProperty({ example: 30111222 })
  @IsInt() @Min(1) @Max(RIF_MAX)
  rif_asegurado: number;

  @ApiProperty({ example: 'MARÍA' })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(250)
  nombre_asegurado: string;

  @ApiPropertyOptional({ example: 'PÉREZ' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(250)
  apellido_asegurado?: string;

  @ApiProperty({ example: 'F', enum: ['M', 'F'] })
  @Transform(upper) @IsIn(['M', 'F'])
  sexo_asegurado: string;

  @ApiPropertyOptional({ example: 'S' })
  @IsOptional() @Transform(upper) @IsString() @MaxLength(1)
  estado_civil_asegurado?: string;

  @ApiProperty({ example: '2015-04-20', description: 'Fecha de nacimiento (YYYY-MM-DD).' })
  @IsDateString()
  fnac_asegurado: string;

  @ApiProperty({ example: 3, description: 'Parentesco con el titular (Sis2000): 2 cónyuge, 3 hijo, 4 padre/madre…' })
  @IsInt() @Min(1) @Max(99)
  nparentesco_asegurado: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  estado_asegurado?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  ciudad_asegurado?: number;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(1000)
  direccion_asegurado?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(250)
  telefono_asegurado?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsEmail() @MaxLength(250)
  correo_asegurado?: string;
}

/** Titular del grupo con sus cargas. Cada titular es un certificado (ccerti 1, 2, 3…). */
export class TitularColectivoDto {
  @ApiPropertyOptional({ example: 'V', enum: TIPOS_CEDULA_COLECTIVO, description: 'Tipo de documento. Alias: tipo_cedula_titular.' })
  @IsOptional() @Transform(upper) @IsIn(TIPOS_CEDULA_COLECTIVO)
  icedula_titular?: string;

  @ApiPropertyOptional({ example: 'V', enum: TIPOS_CEDULA_COLECTIVO, description: 'Alias de icedula_titular (nombre que usa el cotizador).' })
  @IsOptional() @Transform(upper) @IsIn(TIPOS_CEDULA_COLECTIVO)
  tipo_cedula_titular?: string;

  @ApiProperty({ example: 12345678 })
  @IsInt() @Min(1) @Max(RIF_MAX)
  rif_titular: number;

  @ApiProperty({ example: 'JOSÉ' })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(250)
  nombre_titular: string;

  @ApiPropertyOptional({ example: 'RODRÍGUEZ' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(250)
  apellido_titular?: string;

  @ApiProperty({ example: 'M', enum: ['M', 'F'] })
  @Transform(upper) @IsIn(['M', 'F'])
  sexo_titular: string;

  @ApiPropertyOptional({ example: 'C' })
  @IsOptional() @Transform(upper) @IsString() @MaxLength(1)
  estado_civil_titular?: string;

  @ApiProperty({ example: '1985-02-10' })
  @IsDateString()
  fnac_titular: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  estado_titular?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  ciudad_titular?: number;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(1000)
  direccion_titular?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(250)
  telefono_titular?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsEmail() @MaxLength(250)
  correo_titular?: string;

  @ApiPropertyOptional({ type: [AseguradoColectivoDto], description: 'Cargas del titular.' })
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_CARGAS_POR_TITULAR)
  @ValidateNested({ each: true }) @Type(() => AseguradoColectivoDto)
  asegurados?: AseguradoColectivoDto[];
}

/**
 * Emisión colectiva: la empresa contratante es tomador y titular de la póliza; la nómina va en `titulares`.
 * La estructura técnica sale de la plantilla modelo del producto (cpoliza_plantilla + cnpoliza_plantilla) y el precio
 * es la prima que cotizó el cotizador colectivo. Todos los campos que usa el servicio deben estar aquí: el
 * ValidationPipe descarta los no declarados.
 */
export class CreateEmissionColectivoDto {
  @ApiProperty({ example: '328', description: 'cpoliza de la plantilla modelo (pcplanes), definida por Técnica para el producto.' })
  @Transform(({ value }) => (value == null ? value : String(value).trim()))
  @Matches(/^\d{1,19}$/, { message: 'cpoliza_plantilla debe ser numérico (hasta 19 dígitos).' })
  cpoliza_plantilla: string;

  @ApiProperty({ example: 'C-6-328', description: 'cnpoliza de la póliza de la plantilla modelo.' })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(30)
  cnpoliza_plantilla: string;

  @ApiPropertyOptional({ example: 'C', description: 'Compatibilidad con el contrato de SysIP; esta ruta solo emite colectivos.' })
  @IsOptional() @Transform(upper) @IsIn(['C'])
  itipo_emision?: string;

  @ApiProperty({ example: 6, description: 'Ramo. Debe coincidir con el de la plantilla.' })
  @IsInt() @Min(1)
  cramo: number;

  @ApiProperty({ example: '1', description: 'Plan de la plantilla (pcplanes.cplan).' })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10)
  plan: string;

  @ApiProperty({ example: 'M', enum: FRECUENCIAS_COLECTIVO, description: 'A anual, S semestral, C cuatrimestral, T trimestral, M mensual, E especial.' })
  @Transform(upper) @IsIn(FRECUENCIAS_COLECTIVO)
  frecuencia: string;

  @ApiProperty({ example: '2026-11-11' })
  @IsDateString()
  fecha_emision: string;

  @ApiProperty({ example: '2026-11-11' })
  @IsDateString()
  fdesde: string;

  @ApiProperty({ example: '2027-11-11' })
  @IsDateString()
  fhasta: string;

  @ApiProperty({ example: 'USD', description: 'Moneda de la póliza ($/USD, BS, EUR). La tasa sale de mamonedas.' })
  @Transform(upper) @IsString() @IsNotEmpty() @MaxLength(4)
  cmoneda: string;

  @ApiProperty({ example: 1200.5, description: 'Prima ANUAL cotizada del grupo, en la moneda de la póliza. Es la que se cobra.' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  prima: number;

  @ApiPropertyOptional({ example: 15000, description: 'Suma asegurada de la opción cotizada.' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  msumaaseg?: number | null;

  // ── Tomador (empresa contratante) ─────────────────────────────────────────
  @ApiProperty({ example: 'J', enum: TIPOS_CEDULA_COLECTIVO })
  @Transform(upper) @IsIn(TIPOS_CEDULA_COLECTIVO)
  tipo_cedula_tomador: string;

  @ApiProperty({ example: 123456789 })
  @IsInt() @Min(1) @Max(RIF_EMPRESA_MAX)
  rif_tomador: number;

  @ApiProperty({ example: 'EMPRESA EJEMPLO, C.A.' })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(250)
  nombre_tomador: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(250)
  apellido_tomador?: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional() @Transform(upper) @IsString() @MaxLength(1)
  sexo_tomador?: string;

  @ApiPropertyOptional({ example: 'S' })
  @IsOptional() @Transform(upper) @IsString() @MaxLength(1)
  estado_civil_tomador?: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional() @Transform(blankToUndefined) @IsDateString()
  fnac_tomador?: string | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  estado_tomador?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  ciudad_tomador?: number;

  @ApiPropertyOptional({ example: 'Caracas, Venezuela' })
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(1000)
  direccion_tomador?: string;

  @ApiPropertyOptional({ example: 'rrhh@empresa.com' })
  @IsOptional() @Transform(blankToUndefined) @IsEmail() @MaxLength(250)
  correo_tomador?: string;

  @ApiPropertyOptional({ example: '02125550000' })
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(250)
  telefono_tomador?: string;

  // ── Titular de la póliza (la empresa). Si no viene, se toma del tomador. ──
  @ApiPropertyOptional({ example: 'J', enum: TIPOS_CEDULA_COLECTIVO })
  @IsOptional() @Transform(upper) @IsIn(TIPOS_CEDULA_COLECTIVO)
  tipo_cedula_titular?: string;

  @ApiPropertyOptional({ example: 123456789 })
  @IsOptional() @IsInt() @Min(1) @Max(RIF_EMPRESA_MAX)
  rif_titular?: number;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(250)
  nombre_titular?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(250)
  apellido_titular?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(upper) @IsString() @MaxLength(1)
  sexo_titular?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(upper) @IsString() @MaxLength(1)
  estado_civil_titular?: string;

  // ── Declaraciones ─────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 0 })
  @IsOptional() @IsInt() @Min(0) @Max(9)
  dec_persona_politica?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt() @Min(0) @Max(9)
  dec_term_y_cod?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional() @IsInt() @Min(0) @Max(9)
  dec_diagnos_enferm?: number;

  @ApiPropertyOptional()
  @IsOptional() @Transform(blankToUndefined) @IsString() @MaxLength(1000)
  dec_descrip_enferm?: string;

  @ApiProperty({ type: [TitularColectivoDto], description: 'Nómina: titulares con sus cargas.' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_TITULARES_COLECTIVO)
  @ValidateNested({ each: true }) @Type(() => TitularColectivoDto)
  titulares: TitularColectivoDto[];
}
