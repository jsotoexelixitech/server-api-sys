import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Payload de emisión de póliza de personas (ramo 9 = Funerario).
 * Mirror del body que usa el Express original (createEmmisionPersonGeneral),
 * pero con validación class-validator. Todos los campos que el servicio inserta
 * deben estar declarados aquí (el ValidationPipe descarta los no declarados).
 */
export class CreateEmissionPersonDto {
  @ApiProperty({ example: 9, description: 'Código de ramo (9 = Funerario).' })
  @IsInt()
  cramo: number;

  @ApiProperty({ example: 'FUNBAS', description: 'Código del plan.' })
  @IsString()
  @IsNotEmpty()
  plan: string;

  @ApiProperty({ example: '2026-06-01', description: 'Fecha de emisión (YYYY-MM-DD).' })
  @IsDateString()
  fecha_emision: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional() @IsDateString()
  fdesde?: string;

  @ApiPropertyOptional({ example: '2027-05-31' })
  @IsOptional() @IsDateString()
  fhasta?: string;

  @ApiProperty({ example: 'M', description: 'Frecuencia de pago (A/S/T/M).' })
  @IsString()
  frecuencia: string;

  @ApiProperty({ example: 120.5, description: 'Prima total en divisas (USD).' })
  @IsNumber()
  prima: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString()
  cmoneda?: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional() @IsNumber()
  tasa?: number | null;

  @ApiPropertyOptional({ example: null })
  @IsOptional() @IsNumber()
  msumaaseg?: number | null;

  @ApiPropertyOptional({ example: null, description: 'Póliza relacionada (renovación).' })
  @IsOptional() @IsString()
  poliza?: string | null;

  // ── Tomador ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'V' }) @IsOptional() @IsString() tipo_cedula_tomador?: string;
  @ApiPropertyOptional({ example: 'V' }) @IsOptional() @IsString() cedula_tomador?: string;
  @ApiProperty({ example: 25221952 }) @IsNumber() rif_tomador: number | string;
  @ApiPropertyOptional({ example: 'JUAN' }) @IsOptional() @IsString() nombre_tomador?: string;
  @ApiPropertyOptional({ example: 'PEREZ' }) @IsOptional() @IsString() apellido_tomador?: string;
  @ApiPropertyOptional({ example: 'M' }) @IsOptional() @IsString() sexo_tomador?: string;
  @ApiPropertyOptional({ example: 'S' }) @IsOptional() @IsString() estado_civil_tomador?: string;
  @ApiPropertyOptional({ example: '1990-01-01' }) @IsOptional() @IsDateString() fnac_tomador?: string;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() estado_tomador?: number | string;
  @ApiPropertyOptional({ example: 128 }) @IsOptional() ciudad_tomador?: number | string;
  @ApiPropertyOptional({ example: 'Av. Principal' }) @IsOptional() @IsString() direccion_tomador?: string;
  @ApiPropertyOptional({ example: '04141234567' }) @IsOptional() @IsString() telefono_tomador?: string;
  @ApiPropertyOptional({ example: 'juan@mail.com' }) @IsOptional() @IsString() correo_tomador?: string;

  // ── Titular ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'V' }) @IsOptional() @IsString() tipo_cedula_titular?: string;
  @ApiPropertyOptional({ example: 'V' }) @IsOptional() @IsString() cedula_titular?: string;
  @ApiProperty({ example: 25221952 }) @IsNumber() rif_titular: number | string;
  @ApiPropertyOptional({ example: 'JUAN' }) @IsOptional() @IsString() nombre_titular?: string;
  @ApiPropertyOptional({ example: 'PEREZ' }) @IsOptional() @IsString() apellido_titular?: string;
  @ApiPropertyOptional({ example: 'M' }) @IsOptional() @IsString() sexo_titular?: string;
  @ApiPropertyOptional({ example: 'S' }) @IsOptional() @IsString() estado_civil_titular?: string;
  @ApiPropertyOptional({ example: '1990-01-01' }) @IsOptional() @IsDateString() fnac_titular?: string;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() estado_titular?: number | string;
  @ApiPropertyOptional({ example: 128 }) @IsOptional() ciudad_titular?: number | string;
  @ApiPropertyOptional({ example: 'Av. Principal' }) @IsOptional() @IsString() direccion_titular?: string;
  @ApiPropertyOptional({ example: '04141234567' }) @IsOptional() @IsString() telefono_titular?: string;
  @ApiPropertyOptional({ example: 'juan@mail.com' }) @IsOptional() @IsString() correo_titular?: string;

  // ── Declaraciones ──────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 0, description: 'Persona políticamente expuesta (0/1).' })
  @IsOptional() @IsInt() dec_persona_politica?: number;
  @ApiPropertyOptional({ example: 1, description: 'Acepta términos y condiciones (0/1).' })
  @IsOptional() @IsInt() dec_term_y_cod?: number;
  @ApiPropertyOptional({ example: 0, description: 'Tiene diagnóstico de enfermedad (0/1).' })
  @IsOptional() @IsInt() dec_diagnos_enferm?: number;
  @ApiPropertyOptional({ example: '', description: 'Descripción del diagnóstico.' })
  @IsOptional() @IsString() dec_descrip_enferm?: string;

  // ── Canal ──────────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 80080 }) @IsOptional() @IsInt() productor?: number;
  @ApiPropertyOptional({ example: null }) @IsOptional() @IsString() ctipocanal?: string | null;
  @ApiPropertyOptional({ example: null }) @IsOptional() @IsInt() ccanalalt?: number | null;
  @ApiPropertyOptional({ example: null }) @IsOptional() @IsInt() cscanalalt?: number | null;

  // ── Asegurados (para trazabilidad; el cálculo de prima ya viene en `prima`) ──
  @ApiPropertyOptional({ type: [Object], description: 'Lista de asegurados (opcional, informativa).' })
  @IsOptional() @IsArray()
  asegurados?: unknown[];

  @ApiPropertyOptional({ type: [Object], description: 'Lista de beneficiarios (opcional, informativa).' })
  @IsOptional() @IsArray()
  beneficiarios?: unknown[];
}
