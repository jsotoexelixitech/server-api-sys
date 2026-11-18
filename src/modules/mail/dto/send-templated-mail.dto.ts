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
  IsUrl,
  MaxLength,
  ValidateIf,
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

/**
 * Adjunto opcional (xlsx, csv o pdf). Dos formas:
 * - `{ filename, contentType, contentBase64 }`: el archivo va en el body (como siempre);
 * - `{ filename, url }`: nest-api lo descarga (solo https y hosts de `MAIL_ATTACHMENT_URL_HOSTS`).
 * El servicio valida el contenido real, el tamaño (15 MB en total) y sanea el nombre.
 */
export class MailAttachmentDto {
  @ApiProperty({
    example: 'control-documental-2026-11-09.xlsx',
    description: 'Nombre del archivo (se sanea; la extensión la pone el tipo real del contenido).',
  })
  @IsString()
  @MaxLength(150)
  filename!: string;

  @ApiPropertyOptional({
    description:
      'URL del archivo; nest-api lo descarga. Solo https y hosts permitidos (MAIL_ATTACHMENT_URL_HOSTS). ' +
      'Si viene, no hace falta contentBase64.',
    example: 'https://qaapi.lamundialdeseguros.com/sis2000/poliza/26-1-0000137516/2026/11/',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ description: 'Contenido del archivo en base64 (obligatorio si no viene url).' })
  @ValidateIf((o: MailAttachmentDto) => !o.url)
  @IsString()
  @MaxLength(MAIL_ATTACHMENT_MAX_BASE64)
  contentBase64?: string;

  @ApiPropertyOptional({
    enum: MAIL_ATTACHMENT_CONTENT_TYPES,
    description: 'Tipo del archivo: obligatorio con base64; opcional con url (ayuda a reconocer xlsx/csv).',
  })
  @ValidateIf((o: MailAttachmentDto) => !o.url || o.contentType != null)
  @IsIn(MAIL_ATTACHMENT_CONTENT_TYPES)
  contentType?: MailAttachmentType;
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
    description:
      'Adjuntos opcionales: xlsx, csv o pdf, en base64 o por url (https, hosts permitidos); máximo 8 y 15 MB en total. ' +
      'En /mail/send un adjunto inválido o que no se pueda descargar responde 400 sin enviar el correo.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAIL_ATTACHMENTS_MAX)
  @ValidateNested({ each: true })
  @Type(() => MailAttachmentDto)
  attachments?: MailAttachmentDto[];
}
