import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokenRequestDto {
  @ApiPropertyOptional({ example: 'api_key', description: 'Tipo de grant (solo api_key por ahora).' })
  @IsOptional()
  @IsString()
  grant_type?: string;

  @ApiPropertyOptional({ description: 'Clave maclient_api (canje inicial).' })
  @IsOptional()
  @IsString()
  apikey?: string;
}

export class RefreshRequestDto {
  @ApiProperty({ description: 'Refresh token opaco emitido en /auth/token.' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}
