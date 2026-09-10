import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SendFuneralPaymentLinkDto {
  @ApiProperty({ example: 'cliente@email.com' })
  @IsEmail()
  to!: string;

  @ApiPropertyOptional({ example: 'María Fernández' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  name?: string;

  @ApiPropertyOptional({ example: '2.000$ Funerario Individual' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  planName?: string;

  @ApiProperty({ description: 'URL de pago precargada (Pagos + sid)' })
  @IsUrl({ require_tld: false })
  paymentUrl!: string;

  @ApiPropertyOptional({ description: 'ISO 8601 — vigencia del enlace' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
