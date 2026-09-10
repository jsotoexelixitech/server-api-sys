import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SearchAutomobilePropietaryDto {
  @ApiProperty({
    example: 'V-15700585',
    description: 'Documento del propietario/tomador (maclient.cid): tipo-número.',
  })
  @IsString()
  @IsNotEmpty()
  xrif_cliente!: string;
}
