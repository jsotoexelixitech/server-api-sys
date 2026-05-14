import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidateEmissionAutoDto {
  @ApiProperty({ example: 'RCVBAS', description: 'Código del plan a emitir' })
  @IsString()
  @IsNotEmpty()
  plan: string;

  @ApiProperty({ example: 'AE886C23', description: 'Placa del vehículo' })
  @IsString()
  @IsNotEmpty()
  placa: string;

  @ApiPropertyOptional({ example: 'SC1S6ZMV3024323', description: 'Serial de carrocería del vehículo' })
  @IsOptional()
  @IsString()
  serial_carroceria?: string;

  @ApiPropertyOptional({ example: null, description: 'Serial de motor (null si no aplica)' })
  @IsOptional()
  @IsString()
  serial_motor?: string | null;
}
