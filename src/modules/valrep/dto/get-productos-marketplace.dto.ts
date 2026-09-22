import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { GetProductosPersonasDto } from './get-productos-personas.dto';

/**
 * Marketplace SysIP (Valrep.getProducts) — maproductos + planes permitidos + url/qr opcional.
 * No reemplaza POST /valrep/productos (spBuscaProductosEntidad).
 */
export class GetProductosMarketplaceDto extends GetProductosPersonasDto {
  @ApiPropertyOptional({
    description:
      'Prefijo URL emisión (ej. https://…/marketplace/emission?). Si se envía, se arma product.url y qr.',
  })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'Sub-ítem gestor (csub en query SysIP).' })
  @IsOptional()
  @IsString()
  csub?: string;
}
