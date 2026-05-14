import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SearchVehicleByPlateDto {
  @ApiPropertyOptional({ example: 'AE886C20', description: 'Placa del vehículo a buscar' })
  @IsOptional()
  @IsString()
  xplaca?: string;
}

export class SearchVehicleBySerialDto {
  @ApiPropertyOptional({ example: 'SC1S6ZMV3024320', description: 'Serial de carrocería' })
  @IsOptional()
  @IsString()
  xsercar?: string;

  @ApiPropertyOptional({ example: 'SC1S6ZMV3024320', description: 'Alias aceptado para xsercar' })
  @IsOptional()
  @IsString()
  xserialcarroceria?: string;
}
