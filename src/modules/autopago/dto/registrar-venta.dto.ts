import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  value == null ? value : String(value).trim();

export const AUTOPAGO_TIPOS_PERSONA = ['V', 'E', 'J', 'G', 'P'] as const;

export class ProductoVentaDto {
  @ApiProperty({
    example: '12444564',
    description: 'SKU comercial acordado con La Mundial (taprodsku.csku del canal).',
  })
  @Transform(trimString)
  @IsString()
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'csku solo admite letras, números, punto, guion y guion bajo' })
  csku!: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Unidades vendidas de ese SKU. Se genera un enlace de emisión por unidad.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  ncantidad?: number;

  @ApiPropertyOptional({ example: 10.5, description: 'Monto cobrado por unidad (referencial, conciliación).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mmonto?: number;
}

export class RegistrarVentaDto {
  @ApiProperty({ enum: AUTOPAGO_TIPOS_PERSONA, example: 'V', description: 'V, E, J, G o P (pasaporte).' })
  @Transform(({ value }) => (value == null ? value : String(value).trim().toUpperCase()))
  @IsIn(AUTOPAGO_TIPOS_PERSONA as unknown as string[])
  tipo_persona!: string;

  @ApiProperty({ example: '18459203', description: 'Cédula o RIF sin letra ni puntos (pasaporte: alfanumérico).' })
  @Transform(trimString)
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,15}$/, { message: 'cci_rif debe ser alfanumérico de 4 a 15 caracteres' })
  cci_rif!: string;

  @ApiProperty({ example: 'Carlos Eduardo Mendoza', description: 'Nombre y apellido o razón social.' })
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  xcliente!: string;

  @ApiProperty({ example: 'carlos.mendoza@email.com', description: 'Correo donde se envía el enlace de emisión.' })
  @Transform(({ value }) => (value == null ? value : String(value).trim().toLowerCase()))
  @IsEmail()
  @MaxLength(100)
  xcorreo!: string;

  @ApiPropertyOptional({ example: '+584121234567' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20)
  xtelefono?: string;

  @ApiProperty({
    example: '4829104851',
    description: 'Número de factura fiscal. Única por canal: si se repite, responde el registro ya creado.',
  })
  @Transform(trimString)
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,20}$/, { message: 'nfactura admite hasta 20 caracteres alfanuméricos o guion' })
  nfactura!: string;

  @ApiPropertyOptional({
    example: '2026-10-26T14:30:00Z',
    description: 'Fecha y hora de la venta (ISO 8601). Si falta, se usa la fecha de recepción.',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(40)
  fventa?: string;

  @ApiPropertyOptional({ example: 'Farmatodo Las Mercedes', description: 'Tienda o sucursal donde se cobró.' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(250)
  xsucursal?: string;

  @ApiPropertyOptional({ example: 25.5, description: 'Monto total cobrado en caja (referencial).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mmonto?: number;

  @ApiPropertyOptional({ example: '$', description: 'Moneda del monto ($ o Bs).' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(3)
  cmoneda?: string;

  @ApiProperty({ type: [ProductoVentaDto], description: 'Productos de seguros del ticket.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductoVentaDto)
  productos!: ProductoVentaDto[];

  @ApiPropertyOptional({
    example: 8,
    description:
      'Canal alterno Sis2000 (macanalalt). Solo se usa si la API key no tiene canal asignado (pruebas).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ccanalalt?: number;
}
