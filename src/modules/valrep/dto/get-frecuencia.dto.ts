import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
