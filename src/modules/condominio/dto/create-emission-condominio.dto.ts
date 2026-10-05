import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateEmissionCondominioDto {
  @ApiProperty({ example: 38, description: 'Código de ramo (38 = Condominio Residencial).' })
  @IsInt()
  cramo: number;

  @ApiProperty({ example: 'RESIDE', description: 'Código del plan de condominio.' })
  @IsString()
  @IsNotEmpty()
  plan: string;

  @ApiProperty({ example: 'M', enum: ['A', 'S', 'T', 'M', 'E'], description: 'Frecuencia de pago.' })
  @IsIn(['A', 'S', 'T', 'M', 'E'])
  frecuencia: string;

  @ApiPropertyOptional({ example: '2026-07-30', description: 'Fecha de emisión de la póliza (YYYY-MM-DD). Por defecto hoy.' })
  @IsOptional()
  @IsDateString()
  fecha_emision?: string;

  @ApiPropertyOptional({ example: '2026-07-30', description: 'Fecha de inicio de vigencia. Por defecto la fecha de emisión.' })
  @IsOptional()
  @IsDateString()
  fdesde?: string;

  @ApiPropertyOptional({ example: '2027-07-30', description: 'Fecha de fin de vigencia. Por defecto 1 año después de fdesde.' })
  @IsOptional()
  @IsDateString()
  fhasta?: string;

  @ApiPropertyOptional({ example: 4.3, description: 'Monto de la prima en divisas (USD). Si se omite, se calcula automáticamente.' })
  @IsOptional()
  @IsNumber()
  prima?: number;

  @ApiPropertyOptional({ example: '$', description: 'Código de moneda. Por defecto "$".' })
  @IsOptional()
  @IsString()
  cmoneda?: string;

  @ApiPropertyOptional({ example: 1.0, description: 'Tasa de cambio de la moneda.' })
  @IsOptional()
  @IsNumber()
  tasa?: number;

  @ApiPropertyOptional({ example: 250000.00, description: 'Suma asegurada en bolívares.' })
  @IsOptional()
  @IsNumber()
  msumaaseg?: number;

  @ApiPropertyOptional({ example: 250000.00, description: 'Suma asegurada en USD (extranjera).' })
  @IsOptional()
  @IsNumber()
  msumaasegext?: number;

  @ApiPropertyOptional({ example: 15.00, description: 'Porcentaje de comisión del productor.' })
  @IsOptional()
  @IsNumber()
  pcomision?: number;

  @ApiPropertyOptional({ example: 0.00, description: 'Monto de comisión en bolívares.' })
  @IsOptional()
  @IsNumber()
  mcomision?: number;

  @ApiPropertyOptional({ example: 0.00, description: 'Monto de comisión en USD.' })
  @IsOptional()
  @IsNumber()
  mcomisionext?: number;

  // Staging / Datos del Certificado
  @ApiProperty({ example: 'Caseta de Vigilancia, Edif Bella Vista', description: 'Dirección de cobro.' })
  @IsString()
  @IsNotEmpty()
  xdirecob: string;

  @ApiProperty({ example: 'Chacao, Caracas', description: 'Dirección del riesgo.' })
  @IsString()
  @IsNotEmpty()
  xdireccion: string;

  @ApiProperty({ example: 'Edificio de 12 pisos', description: 'Descripción física de la edificación.' })
  @IsString()
  @IsNotEmpty()
  xdescrip1: string;

  @ApiProperty({ example: 'Residencial', description: 'Uso de la edificación.' })
  @IsString()
  @IsNotEmpty()
  xdescrip2: string;

  @ApiPropertyOptional({ example: '', description: 'Descripción física adicional 1.' })
  @IsOptional()
  @IsString()
  xdescrip3?: string;

  @ApiPropertyOptional({ example: '', description: 'Descripción física adicional 2.' })
  @IsOptional()
  @IsString()
  xdescrip4?: string;

  // Arrays de staging
  @ApiPropertyOptional({ example: [1], type: [Number], description: 'IDs de dispositivos de seguridad vinculados.' })
  @IsOptional()
  @IsArray()
  dispositivos?: number[];

  @ApiPropertyOptional({ example: [], type: [Number], description: 'IDs de sustancias peligrosas vinculadas.' })
  @IsOptional()
  @IsArray()
  sustancias?: number[];

  @ApiPropertyOptional({ example: [], type: [Object], description: 'Equipos declarados en el certificado.' })
  @IsOptional()
  @IsArray()
  equipos?: any[];

  // Tomador
  @ApiPropertyOptional({ example: 'V', description: 'Tipo de cédula del tomador.' })
  @IsOptional()
  @IsString()
  tipo_cedula_tomador?: string;

  @ApiProperty({ example: 63025041, description: 'RIF o Cédula del tomador (solo números).' })
  @IsNotEmpty()
  rif_tomador: number | string;

  @ApiPropertyOptional({ example: 'Condominio Bella Vista', description: 'Nombre o Razón Social del tomador.' })
  @IsOptional()
  @IsString()
  nombre_tomador?: string;

  @ApiPropertyOptional({ example: 'A.C.', description: 'Apellido o tipo de asociación del tomador.' })
  @IsOptional()
  @IsString()
  apellido_tomador?: string;

  @ApiPropertyOptional({ example: 'M', description: 'Sexo del tomador.' })
  @IsOptional()
  @IsString()
  sexo_tomador?: string;

  @ApiPropertyOptional({ example: 'S', description: 'Estado civil del tomador.' })
  @IsOptional()
  @IsString()
  estado_civil_tomador?: string;

  @ApiPropertyOptional({ example: '1990-01-01', description: 'Fecha de nacimiento o constitución del tomador.' })
  @IsOptional()
  @IsDateString()
  fnac_tomador?: string;

  @ApiPropertyOptional({ example: '1', description: 'Código del estado de dirección del tomador.' })
  @IsOptional()
  estado_tomador?: number | string;

  @ApiPropertyOptional({ example: '1', description: 'Código de la ciudad de dirección del tomador.' })
  @IsOptional()
  ciudad_tomador?: number | string;

  @ApiPropertyOptional({ example: 'Av. Principal', description: 'Dirección detallada del tomador.' })
  @IsOptional()
  @IsString()
  direccion_tomador?: string;

  @ApiPropertyOptional({ example: '04141234567', description: 'Teléfono del tomador.' })
  @IsOptional()
  @IsString()
  telefono_tomador?: string;

  @ApiPropertyOptional({ example: 'condo@mail.com', description: 'Correo electrónico del tomador.' })
  @IsOptional()
  @IsString()
  correo_tomador?: string;

  // Asegurado
  @ApiPropertyOptional({ example: 'V', description: 'Tipo de cédula del asegurado.' })
  @IsOptional()
  @IsString()
  tipo_cedula_asegurado?: string;

  @ApiProperty({ example: 63025041, description: 'RIF o Cédula del asegurado (solo números).' })
  @IsNotEmpty()
  rif_asegurado: number | string;

  @ApiPropertyOptional({ example: 'Condominio Bella Vista', description: 'Nombre o Razón Social del asegurado.' })
  @IsOptional()
  @IsString()
  nombre_asegurado?: string;

  @ApiPropertyOptional({ example: 'A.C.', description: 'Apellido o tipo de asociación del asegurado.' })
  @IsOptional()
  @IsString()
  apellido_asegurado?: string;

  @ApiPropertyOptional({ example: 'M', description: 'Sexo del asegurado.' })
  @IsOptional()
  @IsString()
  sexo_asegurado?: string;

  @ApiPropertyOptional({ example: 'S', description: 'Estado civil del asegurado.' })
  @IsOptional()
  @IsString()
  estado_civil_asegurado?: string;

  @ApiPropertyOptional({ example: '1990-01-01', description: 'Fecha de nacimiento o constitución del asegurado.' })
  @IsOptional()
  @IsDateString()
  fnac_asegurado?: string;

  @ApiPropertyOptional({ example: '1', description: 'Código del estado de dirección del asegurado.' })
  @IsOptional()
  estado_asegurado?: number | string;

  @ApiPropertyOptional({ example: '1', description: 'Código de la ciudad de dirección del asegurado.' })
  @IsOptional()
  ciudad_asegurado?: number | string;

  @ApiPropertyOptional({ example: 'Av. Principal', description: 'Dirección detallada del asegurado.' })
  @IsOptional()
  @IsString()
  direccion_asegurado?: string;

  @ApiPropertyOptional({ example: '04141234567', description: 'Teléfono del asegurado.' })
  @IsOptional()
  @IsString()
  telefono_asegurado?: string;

  @ApiPropertyOptional({ example: 'condo@mail.com', description: 'Correo electrónico del asegurado.' })
  @IsOptional()
  @IsString()
  correo_asegurado?: string;

  // Canal / Venta
  @ApiPropertyOptional({ example: 80080, description: 'Código del productor.' })
  @IsOptional()
  @IsInt()
  productor?: number;

  @ApiPropertyOptional({ example: 'D', description: 'Tipo de canal (D = Directo, etc.).' })
  @IsOptional()
  @IsString()
  ctipocanal?: string;

  @ApiPropertyOptional({ example: null, description: 'Código del canal alternativo.' })
  @IsOptional()
  @IsInt()
  ccanalalt?: number | null;

  @ApiPropertyOptional({ example: null, description: 'Código de sub-canal alternativo.' })
  @IsOptional()
  @IsInt()
  cscanalalt?: number | null;

  @ApiPropertyOptional({ example: 'TEST_NEXUS', description: 'Descripción del canal de venta.' })
  @IsOptional()
  @IsString()
  xcanal_venta?: string;
}
