import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body para POST /valrep/matipopago-entidades (paridad SysIP-backend). */
export class GetMatipopagoEntidadesDto {
  @ApiProperty({ example: 'C', description: 'Entidad: C = canal, P = productor.' })
  @IsString()
  @IsNotEmpty()
  centidad: string;

  @ApiProperty({ example: '1', description: 'Ítem (ccanalalt si centidad=C).' })
  @IsString()
  @IsNotEmpty()
  citem: string;

  @ApiPropertyOptional({ example: '57', description: 'Producto opcional.' })
  @IsOptional()
  @IsString()
  cproducto?: string;
}
