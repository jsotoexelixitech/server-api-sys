import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CambioDatosVehiculoDto {
  @ApiProperty({ example: '18-1-0000079163', description: 'Número de póliza' })
  @IsString()
  cnpoliza: string;

  @ApiProperty({ example: 2026, description: 'Año de la póliza (fanopol)' })
  @IsInt()
  fanopol: number;

  @ApiProperty({ example: 8, description: 'Mes de la póliza (fmespol)' })
  @IsInt()
  fmespol: number;

  @ApiPropertyOptional({ example: 1, description: 'Número de certificado (ccerti)' })
  @IsOptional()
  @IsInt()
  ccerti?: number = 1;

  @ApiProperty({ example: 'AB123CD', description: 'Nueva placa del vehículo' })
  @IsString()
  xplaca: string;

  @ApiProperty({ example: 'MOT987654321', description: 'Serial de motor' })
  @IsString()
  xsermot: string;

  @ApiProperty({ example: 'CAR123456789', description: 'Serial de carrocería' })
  @IsString()
  xsercar: string;

  @ApiProperty({ example: 'BLANCO', description: 'Color del vehículo' })
  @IsString()
  xcolor: string;

  @ApiProperty({ example: 2024, description: 'Año/Modelo del vehículo (fano)' })
  @IsInt()
  fano: number;

  @ApiProperty({ example: 'TOYO', description: 'Código de marca' })
  @IsString()
  cmarca: string;

  @ApiProperty({ example: 'CORO', description: 'Código de modelo' })
  @IsString()
  cmodelo: string;

  @ApiProperty({ example: 'GLI', description: 'Código de versión' })
  @IsString()
  cversion: string;

  @ApiPropertyOptional({ example: 1422, description: 'ID del usuario operador' })
  @IsOptional()
  @IsInt()
  cusuario?: number;
}
