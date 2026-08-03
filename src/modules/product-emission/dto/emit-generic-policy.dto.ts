import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PartyDto } from './party.dto';

export class EmitGenericPolicyDto {
  @ApiProperty({
    description: 'ID del producto (ramo) creado en proyecto-product-builder',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({
    description: 'Nombre exacto del plan comercial. Si se omite, usa el recomendado/primero.',
    example: 'Plan Estándar',
  })
  @IsOptional()
  @IsString()
  planName?: string;

  @ApiPropertyOptional({
    description: 'Vigencia en días. Default: 365.',
    example: 365,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  vigenciaDias?: number;

  @ApiPropertyOptional({ example: '2026-08-03' })
  @IsOptional()
  @IsDateString()
  fechaEmision?: string;

  @ApiProperty({ type: PartyDto })
  @ValidateNested()
  @Type(() => PartyDto)
  tomador!: PartyDto;

  @ApiProperty({ type: PartyDto })
  @ValidateNested()
  @Type(() => PartyDto)
  asegurado!: PartyDto;

  @ApiPropertyOptional({ type: [PartyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyDto)
  beneficiarios?: PartyDto[];

  @ApiPropertyOptional({
    description:
      'Valores de "Datos del riesgo" (FormField de RISK_DATA en product-builder). Clave = label del campo, valor = respuesta.',
    example: { Placa: 'AB123CD', Marca: 'Toyota', Modelo: 'Corolla' },
  })
  @IsOptional()
  @IsObject()
  riskData?: Record<string, unknown>;
}
