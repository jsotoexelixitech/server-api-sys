import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SearchVehicleByPlateDto {
  @ApiProperty({
    example: 'AE886C20',
    description: 'Placa del vehículo. Usado en paso 5a antes de validar/emisión.',
  })
  @IsOptional()
  @IsString()
  xplaca?: string;
}

export class SearchVehicleBySerialDto {
  @ApiProperty({
    example: 'SC1S6ZMV3024320',
    description: 'Serial de carrocería (preferido).',
  })
  @IsOptional()
  @IsString()
  xsercar?: string;

  @ApiPropertyOptional({
    example: 'SC1S6ZMV3024320',
    description: 'Alias aceptado — mismo valor que `xsercar`.',
  })
  @IsOptional()
  @IsString()
  xserialcarroceria?: string;
}
