import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CollectionSearchDto {
  @ApiProperty({ example: 'V19908817', description: 'RIF/cédula del cliente (con prefijo V/E/J)' })
  @IsString()
  @IsNotEmpty()
  cci_rif: string;
}
