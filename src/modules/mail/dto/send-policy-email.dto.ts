import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAIL_ATTACHMENTS_MAX } from '../mail-attachments';
import { MailAttachmentDto } from './send-templated-mail.dto';

export class SendPolicyEmailDto {
  @ApiProperty({ example: 'juan.perez@email.com' })
  @IsEmail()
  to!: string;

  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  name?: string;

  @ApiProperty({ example: '18-1-0000080549', description: 'Póliza principal.' })
  @IsString()
  @MaxLength(30)
  cnpoliza!: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cnrecibo?: string;

  @ApiPropertyOptional({ example: 2026 })
  fanopol?: number;

  @ApiPropertyOptional({ example: 8 })
  fmespol?: number;

  @ApiPropertyOptional({ description: 'Estado recibo Sis2000 (C=cobrado). Solo modo sisip.' })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  iestadorec?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiPropertyOptional({ description: 'URL cuadro-póliza' })
  @IsOptional()
  @IsUrl()
  urlpoliza?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url_conductor_habitual?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url_club_arys?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url_ingreso_caja?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url_recibo?: string;

  @ApiPropertyOptional({
    example: 'Pérdida Total',
    description: 'Ramo o producto de la póliza principal. Solo se muestra en el correo cuando hay dos pólizas.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  producto?: string;

  // ── Segunda póliza (p. ej. el RCV que sale aparte en Auto Casco) ──────────────────────

  @ApiPropertyOptional({
    example: '26-1-0000137516',
    description: 'Segunda póliza emitida junto a la principal. Con ella el asunto y el texto nombran las dos pólizas.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cnpoliza_rcv?: string;

  @ApiPropertyOptional({ example: '12345679', description: 'Recibo de la segunda póliza (informativo).' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cnrecibo_rcv?: string;

  @ApiPropertyOptional({ example: 2026, description: 'Año de la segunda póliza (informativo).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fanopol_rcv?: number;

  @ApiPropertyOptional({ example: 11, description: 'Mes de la segunda póliza (informativo).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fmespol_rcv?: number;

  @ApiPropertyOptional({
    description: 'URL del cuadro-póliza de la segunda póliza; se adjunta como el de la principal.',
    example: 'https://qaapi.lamundialdeseguros.com/sis2000/poliza/26-1-0000137516/2026/11/',
  })
  @IsOptional()
  @IsUrl()
  urlpoliza_rcv?: string;

  @ApiPropertyOptional({ example: 'RCV', description: 'Ramo o producto de la segunda póliza (para el texto del correo).' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  producto_rcv?: string;

  @ApiPropertyOptional({ description: 'URL del PDF del beneficiario preferencial; se adjunta.' })
  @IsOptional()
  @IsUrl()
  url_beneficiario_preferencial?: string;

  @ApiPropertyOptional({
    type: [MailAttachmentDto],
    description:
      'Adjuntos adicionales: `{ filename, url }` o `{ filename, contentType, contentBase64 }` (pdf, xlsx o csv). ' +
      'Máximo 8 adjuntos en todo el correo (contando los de urlpoliza, url_recibo, etc.) y 15 MB en total. ' +
      'Un adjunto que no se pueda usar se omite (el correo sale igual) y se informa en `adjuntos.omitidos`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAIL_ATTACHMENTS_MAX)
  @ValidateNested({ each: true })
  @Type(() => MailAttachmentDto)
  attachments?: MailAttachmentDto[];
}
