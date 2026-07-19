import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CollectionSearchDto {
  @ApiProperty({
    example: 'V14484939',
    description: 'RIF/cédula del tomador o asegurado (con prefijo V/E/J). Usado en `spSearchForCustomerByReceipt`.',
  })
  @IsString()
  @IsNotEmpty()
  cci_rif: string;
}
