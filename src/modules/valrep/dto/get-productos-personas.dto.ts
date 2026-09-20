import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Body para POST /valrep/productos (marketplace SysIP / spBuscaProductosEntidad).
 * Si no envía centidad+citem, puede resolver por gestor (correo) o cproductor.
 */
export class GetProductosPersonasDto {
  @ApiPropertyOptional({ example: '80080' })
  @IsOptional()
  @IsString()
  citem?: string;

  @ApiPropertyOptional({ example: 'P', enum: ['P', 'C', 'G'] })
  @IsOptional()
  @IsIn(['P', 'C', 'G'])
  centidad?: string;

  @ApiPropertyOptional({ description: 'Correo del gestor (magestor.xcorreo).' })
  @IsOptional()
  @IsString()
  cgestor_in?: string;

  @ApiPropertyOptional({ description: 'Código gestor Sis2000.' })
  @IsOptional()
  @IsString()
  cgestor?: string;

  @ApiPropertyOptional({ example: '80080' })
  @IsOptional()
  @IsString()
  cproductor?: string;
}
