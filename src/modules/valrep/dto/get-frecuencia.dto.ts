import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class GetFrecuenciaDto {
  @ApiProperty({
    example: 'RCVBAS',
    description: 'Código de plan obtenido de `POST /valrep/planes/v2`',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  cplan: string;

  @ApiPropertyOptional({ example: 18, description: 'Ramo RCV (opcional, p. ej. 18)' })
  @IsOptional()
  @IsInt()
  cramo?: number;

  @ApiPropertyOptional({
    example: 348,
    description: 'Código de productor/corredor (opcional, para consultar frecuencias especiales en maplanes_frec_produc)',
  })
  @IsOptional()
  @IsInt()
  cproductor?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Si es true, no se aplica el respaldo ANUAL: un plan sin frecuencias habilitadas devuelve la lista vacía. ' +
      'Lo usan Condominio y Hogar (solo se ofrece lo configurado en maplanes_frec). RCV, Funerario y Viajero no lo envían.',
  })
  @IsOptional()
  @IsBoolean()
  estricto?: boolean;
}
