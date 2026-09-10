import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body para POST /valrep/matipoemision (paridad SysIP-backend). */
export class GetMatipoemisionDto {
  @ApiProperty({
    example: 'C',
    description: 'Entidad: C = canal alterno, P = productor.',
  })
  @IsString()
  @IsNotEmpty()
  centidad: string;

  @ApiProperty({
    example: '1',
    description: 'Ítem de la entidad (ccanalalt si centidad=C).',
  })
  @IsString()
  @IsNotEmpty()
  citem: string;

  @ApiPropertyOptional({
    example: '57',
    description: 'Producto opcional para override por producto.',
  })
  @IsOptional()
  @IsString()
  cproducto?: string;
}
