import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/** Query GET /moneda/tasa-bcv — tasa USD BCV para fecha de pago. */
export class GetTasaBcvDto {
  @ApiPropertyOptional({
    example: '2026-09-18',
    description: 'Fecha del pago móvil (YYYY-MM-DD). Alias: fmoneda.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha debe ser YYYY-MM-DD',
  })
  fecha?: string;

  @ApiPropertyOptional({ example: '2026-09-18', description: 'Alias legacy de fecha.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fmoneda debe ser YYYY-MM-DD',
  })
  fmoneda?: string;
}
