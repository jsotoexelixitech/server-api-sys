import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateEmissionAutoDto {
  // ── Póliza ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'POL-0001', description: 'Nro. de Póliza/Contrato (null = auto-generado)' })
  @IsOptional()
  @IsString()
  poliza?: string;

  @ApiProperty({ example: 18, description: 'Código de ramo (18 = automóvil)' })
  @IsInt()
  @Min(1)
  cramo: number;

  @ApiProperty({ example: 'RCVBAS', description: 'Código del plan', enum: ['RCVBAS', 'RUSPAT', 'Auto', 'AutoI', 'AutoIV', 'AutoIII'] })
  @IsString()
  @IsNotEmpty()
  plan: string;

  // ── Tomador ───────────────────────────────────────────────────────────────

  @ApiProperty({ example: 'V', description: 'Tipo cédula del tomador', enum: ['V', 'E', 'J', 'G', 'P'] })
  @IsString()
  tipo_cedula_tomador: string;

  @ApiProperty({ example: 25221952, description: 'RIF del tomador (solo números)' })
  @IsNumber()
  rif_tomador: number | string;

  @ApiProperty({ example: 'Gabriel', description: 'Nombre del tomador' })
  @IsString()
  nombre_tomador: string;

  @ApiProperty({ example: 'Estacio', description: 'Apellido del tomador' })
  @IsString()
  apellido_tomador: string;

  @ApiProperty({ example: '+584241829583', description: 'Teléfono del tomador' })
  @IsString()
  telefono_tomador: string;

  @ApiProperty({ example: 'gabriel@email.com', description: 'Correo del tomador' })
  @IsString()
  correo_tomador: string;

  @ApiPropertyOptional({ example: 'M', description: 'Sexo del tomador', enum: ['M', 'F'] })
  @IsOptional()
  @IsString()
  sexo_tomador?: string;

  @ApiPropertyOptional({ example: 'S', description: 'Estado civil del tomador', enum: ['S', 'C', 'V', 'D'] })
  @IsOptional()
  @IsString()
  estado_civil_tomador?: string;

  /** Alias usado por emision-api / Sis2000 (mismo valor que estado_civil_tomador) */
  @ApiPropertyOptional({ example: 'S', enum: ['S', 'C', 'V', 'D'] })
  @IsOptional()
  @IsString()
  iestado_civil_tomador?: string;

  @ApiProperty({ example: '1996-10-13', description: 'Fecha de nacimiento del tomador (YYYY-MM-DD)' })
  @IsDateString()
  fnac_tomador: string;

  @ApiProperty({ example: 1, description: 'Código de estado del tomador (de /valrep/states)' })
  @IsInt()
  estado_tomador: number;

  @ApiProperty({ example: 128, description: 'Código de ciudad del tomador (de /valrep/cities)' })
  @IsInt()
  ciudad_tomador: number;

  @ApiProperty({ example: 'Av norte 8 amadores a planas', description: 'Dirección del tomador' })
  @IsString()
  direccion_tomador: string;

  // ── Titular ───────────────────────────────────────────────────────────────

  @ApiProperty({ example: 'V', description: 'Tipo cédula del titular', enum: ['V', 'E', 'J', 'G', 'P'] })
  @IsString()
  tipo_cedula_titular: string;

  @ApiProperty({ example: 25221952, description: 'RIF del titular (puede ser igual al tomador)' })
  @IsNumber()
  rif_titular: number | string;

  @ApiProperty({ example: 'Gabriel', description: 'Nombre del titular' })
  @IsString()
  nombre_titular: string;

  @ApiProperty({ example: 'Estacio', description: 'Apellido del titular' })
  @IsString()
  apellido_titular: string;

  @ApiProperty({ example: '+584241829583', description: 'Teléfono del titular' })
  @IsString()
  telefono_titular: string;

  @ApiProperty({ example: 'gabriel@email.com', description: 'Correo del titular' })
  @IsString()
  correo_titular: string;

  @ApiProperty({ example: 'M', description: 'Sexo del titular', enum: ['M', 'F'] })
  @IsString()
  sexo_titular: string;

  @ApiPropertyOptional({ example: 'S', description: 'Estado civil del titular', enum: ['S', 'C', 'V', 'D'] })
  @IsOptional()
  @IsString()
  estado_civil_titular?: string;

  @ApiPropertyOptional({ example: 'S', enum: ['S', 'C', 'V', 'D'] })
  @IsOptional()
  @IsString()
  iestado_civil_titular?: string;

  @ApiPropertyOptional({ example: '1996-10-13', description: 'Fecha de nacimiento del titular (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fnac_titular?: string;

  @ApiProperty({ example: 1, description: 'Código de estado del titular' })
  @IsInt()
  estado_titular: number;

  @ApiProperty({ example: 128, description: 'Código de ciudad del titular' })
  @IsInt()
  ciudad_titular: number;

  @ApiProperty({ example: 'Av norte 8 amadores a planas', description: 'Dirección del titular' })
  @IsString()
  direccion_titular: string;

  // ── Vehículo ──────────────────────────────────────────────────────────────

  @ApiProperty({ example: '083', description: 'Código de marca (de /inma/marcas)' })
  @IsString()
  marca: string;

  @ApiProperty({ example: '001', description: 'Código de modelo (de /inma/modelo)' })
  @IsString()
  modelo: string;

  @ApiProperty({ example: '03', description: 'Código de versión (de /inma/version)' })
  @IsString()
  version: string;

  @ApiProperty({ example: 2004, description: 'Año del vehículo' })
  @IsInt()
  fano: number;

  @ApiProperty({ example: 'Negro', description: 'Color del vehículo' })
  @IsString()
  color: string;

  @ApiProperty({ example: 'AE886C23', description: 'Placa del vehículo' })
  @IsString()
  placa: string;

  @ApiProperty({ example: 'SC1S6ZMV3024323', description: 'Serial de carrocería' })
  @IsString()
  serial_carroceria: string;

  @ApiPropertyOptional({ example: null, description: 'Serial de motor (null si no aplica)' })
  @IsOptional()
  @IsString()
  serial_motor?: string | null;

  @ApiProperty({ example: 11, description: 'Categoría de uso del vehículo (de /inma/categorias-uso)' })
  @IsInt()
  ccategoria_uso: number;

  @ApiPropertyOptional({ example: 5, description: 'Número de puestos del vehículo' })
  @IsOptional()
  @IsInt()
  npuestos?: number;

  @ApiPropertyOptional({ example: 60, description: 'Toneladas del vehículo (para carga)' })
  @IsOptional()
  @IsInt()
  ntoneladas?: number;

  @ApiPropertyOptional({ example: 'N', description: 'Indicador de placa (N=Nacional, E=Extranjera, B=Binacional)', enum: ['N', 'E', 'B'] })
  @IsOptional()
  @IsString()
  iplaca?: string;

  @ApiPropertyOptional({ example: 0, description: 'Porcentaje de recargo RCV' })
  @IsOptional()
  @IsInt()
  Precargorcv?: number;

  // ── Declaraciones y condiciones ───────────────────────────────────────────

  @ApiProperty({ example: 0, description: 'Persona políticamente expuesta (0=No, 1=Sí)', enum: [0, 1] })
  @IsIn([0, 1, '0', '1'])
  dec_persona_politica: number | string;

  @ApiProperty({ example: 1, description: 'Términos y condiciones aceptados (0=No, 1=Sí)', enum: [0, 1] })
  @IsIn([0, 1, '0', '1'])
  dec_term_y_cod: number | string;

  // ── Emisión ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 80080, description: 'Código del productor' })
  @IsOptional()
  @IsNumber()
  productor?: number;

  @ApiProperty({ example: 'A', description: 'Frecuencia de pago', enum: ['A', 'S', 'C', 'T', 'M'] })
  @IsIn(['A', 'S', 'C', 'T', 'M'])
  frecuencia: string;

  @ApiProperty({ example: '2025-06-30', description: 'Fecha de emisión (YYYY-MM-DD)' })
  @IsDateString()
  fecha_emision: string;

  @ApiPropertyOptional({ example: '2025-06-30', description: 'Fecha emisión (alias femision)' })
  @IsOptional()
  @IsDateString()
  femision?: string;

  @ApiPropertyOptional({ example: '2025-06-30', description: 'Vigencia desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fdesde?: string;

  @ApiPropertyOptional({ example: '2026-06-29', description: 'Vigencia hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fhasta?: string;

  @ApiPropertyOptional({ example: '25221952', description: 'Código del usuario que emite' })
  @IsOptional()
  @IsString()
  cusuario?: string;
}
