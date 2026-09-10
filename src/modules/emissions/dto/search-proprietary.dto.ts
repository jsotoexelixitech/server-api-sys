import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Body: documento del cliente. Se busca en `maclient.cci_rif` (número)
 * y en `maclient.cid` (con o sin letra, ej. `V18456329` / `18456329`).
 */
export class SearchProprietaryDto {
  @ApiPropertyOptional({
    example: '18456329',
    description:
      'Cédula/RIF. Puede ir con letra (`V18456329`) o solo dígitos. Obligatorio si no envía `cid`.',
  })
  @IsOptional()
  @IsString()
  xrif_cliente?: string;

  @ApiPropertyOptional({
    example: 'V18456329',
    description: 'Alias de `xrif_cliente`.',
  })
  @IsOptional()
  @IsString()
  cid?: string;
}
