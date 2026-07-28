import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GetFrecuenciaDto {
  @ApiProperty({
    example: 'RCVBAS',
    description: 'Código de plan obtenido de `POST /valrep/planes/v2`',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  cplan: string;
}
