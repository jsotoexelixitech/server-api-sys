import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class CollectionPaymentDto {
  @ApiProperty({ example: '18-100143232', description: 'Número de recibo Sis2000' })
  @IsString()
  @IsNotEmpty()
  cnrecibo: string;

  @ApiProperty({ example: 198114.5, description: 'Monto pagado en bolívares (Bs)' })
  @Type(() => Number)
  @IsNumber()
  mpago: number;

  @ApiProperty({ example: 'REF123456789', description: 'Referencia bancaria del pago' })
  @IsString()
  @IsNotEmpty()
  xreferencia: string;

  @ApiProperty({ example: '2026-07-02', description: 'Fecha del pago (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fpago: string;

  @ApiPropertyOptional({ example: 4, description: 'Usuario Sis2000 (default desde maclient_api)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cusuario?: number;

  @ApiPropertyOptional({ example: 30, description: 'Código cbanco origen en mabanco (si ya se conoce)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cbanco?: number;

  @ApiPropertyOptional({ example: '0134', description: 'Código ref. banco origen (cbanco_ref) del pago móvil verificado' })
  @IsOptional()
  @IsString()
  cbanco_ref?: string;

  @ApiPropertyOptional({ example: 35, description: 'Código cbanco_destino (MABANCO_DESTINO); fallback maclient_api' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cbanco_destino?: number;

  @ApiPropertyOptional({ example: '584243678907', description: 'Teléfono origen del pago móvil verificado' })
  @IsOptional()
  @IsString()
  xtelefono?: string;

  @ApiPropertyOptional({ example: '04143966962', description: 'Teléfono destino La Mundial del pago móvil' })
  @IsOptional()
  @IsString()
  telefono_dest?: string;

  @ApiPropertyOptional({ example: 'V-24174934', description: 'Cédula/RIF del pagador (pago móvil)' })
  @IsOptional()
  @IsString()
  cci_rif?: string;

  @ApiPropertyOptional({ example: '0171', description: 'Código ref. banco destino (banco_destino en pago_movil)' })
  @IsOptional()
  @IsString()
  cbanco_dest_ref?: string;
}
