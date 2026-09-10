import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SendPolicyEmailDto {
  @ApiProperty({ example: 'juan.perez@email.com' })
  @IsEmail()
  to!: string;

  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  name?: string;

  @ApiProperty({ example: '18-1-0000080549' })
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
}
