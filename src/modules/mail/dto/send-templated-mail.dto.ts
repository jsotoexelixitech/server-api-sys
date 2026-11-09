import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  MAIL_ATTACHMENT_CONTENT_TYPES,
  MAIL_ATTACHMENT_MAX_BASE64,
  MAIL_ATTACHMENTS_MAX,
  type MailAttachmentType,
} from '../mail-attachments';

export const MAIL_TEMPLATE_IDS = [
  'funeral-payment-link',
  'funeral-review-alert',
  'funeral-rejected',
  'branded',
  'expediente-documentos',
  'expediente-codigo',
  'expediente-reporte-diario',
  'expediente-reporte-diario-simple',
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

/** Adjunto opcional (xlsx, csv o pdf); el servicio valida base64, tamaño total (8 MB) y nombre. */
export class MailAttachmentDto {
  @ApiProperty({ example: 'control-documental-2026-11-09.xlsx' })
  @IsString()
  @MaxLength(150)
  filename!: string;

  @ApiProperty({ description: 'Contenido del archivo en base64.' })
  @IsString()
  @MaxLength(MAIL_ATTACHMENT_MAX_BASE64)
  contentBase64!: string;

  @ApiProperty({ enum: MAIL_ATTACHMENT_CONTENT_TYPES })
  @IsIn(MAIL_ATTACHMENT_CONTENT_TYPES)
  contentType!: MailAttachmentType;
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

  @ApiPropertyOptional({
    description:
      'true = destinatarios en copia oculta (CCO): "Para" lleva la cuenta remitente y la lista va en BCC. ' +
      'Solo aplica con más de un destinatario; sin el campo el envío no cambia.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  ocultarDestinatarios?: boolean;

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
      'expediente-codigo: subject, nombre, codigo (6 dígitos), minutos. ' +
      'expediente-reporte-diario (control documental diario de Nexus): subject, areas, fecha (DD/MM/AAAA), corte, ' +
      'dia { emitidas, completas, incompletas, sinDatos }, distribucion { faltantes, ilegibles, inconsistentes, porValidar }, ' +
      'polizas[] (máx. 200) { poliza, asegurado (protegido), producto, emitidaPor, observacion, dias, intentos, ultimoResultado, noEnviar, siguienteAccion }, ' +
      'polizasRestantes, cartera { total, completos, incompletos, sinDatos, desglose[] { label, valor } }, ' +
      'historicos { anteriores, sinRespuesta, sinCorreoValido, noEnviar }, conciliacion { emisionesNexus, enMonitor, noPasaronOcr, sinVinculo }, ' +
      'entregabilidad { intentos, entregados, conError, sinCorreo, bloqueados, excluidos }, tecnicos { documentosNoLeidos, fallasTecnicas }, enlace. ' +
      'expediente-reporte-diario-simple (versión corta; el detalle va en el Excel adjunto): subject, fecha (DD/MM/AAAA), corte, ' +
      'completados, incompletos, canales { completos, incompletos }, productores { completos, incompletos }, sinDatos, ' +
      'adjunto (bool), omitidas { incompletos, completados }.',
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

  @ApiPropertyOptional({
    type: [MailAttachmentDto],
    description: 'Adjuntos opcionales: xlsx, csv o pdf; máximo 5 y 8 MB en total.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAIL_ATTACHMENTS_MAX)
  @ValidateNested({ each: true })
  @Type(() => MailAttachmentDto)
  attachments?: MailAttachmentDto[];
}
