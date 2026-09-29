import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendFuneralReviewAlertDto {
  @ApiProperty({ example: 'tecnico@lamundialdeseguros.com' })
  @IsEmail()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  tomadorNombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  planName?: string;

  @ApiPropertyOptional({ example: 'Vida', description: 'Producto real (Vida, Accidentes Personales…). Default: Funerario' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  productLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  scoreTotal?: string;
}
