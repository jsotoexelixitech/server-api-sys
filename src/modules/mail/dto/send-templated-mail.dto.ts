import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const MAIL_TEMPLATE_IDS = [
  'funeral-payment-link',
  'funeral-review-alert',
  'funeral-rejected',
  'branded',
  'expediente-documentos',
  'expediente-codigo',
] as const;

export type MailTemplateId = (typeof MAIL_TEMPLATE_IDS)[number];

export class BrandedMailFieldDto {
  @ApiProperty({ example: 'Plan' })
  @IsString()
  @MaxLength(80)
  label!: string;

  @ApiProperty({ example: 'Funerario Individual' })
  @IsString()
  @MaxLength(250)
  value!: string;
}

export class SendTemplatedMailDto {
  @ApiProperty({ example: 'autorizador@lamundialdeseguros.com' })
  @IsEmail()
  to!: string;

  @ApiPropertyOptional({ type: [String], description: 'Destinatarios extra (To)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  toExtra?: string[];

  @ApiPropertyOptional({ example: 'Mesa técnica' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toName?: string;

  @ApiProperty({ enum: MAIL_TEMPLATE_IDS })
  @IsIn(MAIL_TEMPLATE_IDS)
  template!: MailTemplateId;

  @ApiProperty({
    description:
      'Variables de la plantilla. funeral-review-alert: tomadorNombre, planName, scoreTotal. ' +
      'funeral-payment-link: name, planName, paymentUrl, expiresAt. ' +
      'funeral-rejected: tomadorNombre, planName, reason. ' +
      'branded: subject, eyebrow, title, intro, fields[], ctaLabel, ctaUrl, extraNote, introArriba (false = intro solo dentro de la tarjeta). ' +
      'expediente-documentos: tipo (solicitud|recordatorio|observado|recibido|completo), subject, nombre, polizas[], ' +
      'documentos[] { nombre, estado (pendiente|corregir|en_revision|recibido|aprobado), motivo, poliza }, enlace. ' +
      'expediente-codigo: subject, nombre, codigo (6 dígitos), minutos.',
    example: { tomadorNombre: 'Joel Yepes', planName: 'Funerario Individual', scoreTotal: '25.5' },
  })
  @IsObject()
  data!: Record<string, unknown>;

  @ApiPropertyOptional({ type: [BrandedMailFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BrandedMailFieldDto)
  fields?: BrandedMailFieldDto[];
}
