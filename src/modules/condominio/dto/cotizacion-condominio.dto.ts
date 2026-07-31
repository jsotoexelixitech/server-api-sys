import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CotizacionCondominioDto {
  @ApiPropertyOptional({ example: 38, description: 'Código de ramo (38 = Condominio Residencial). Por defecto 38.' })
  @IsOptional()
  @IsInt()
  cramo?: number;

  @ApiProperty({ example: 'RESIDE', description: 'Código del plan de condominio.' })
  @IsString()
  @IsNotEmpty()
  cplan: string;


  @ApiProperty({ example: 'M', enum: ['A', 'S', 'T', 'M', 'E'], description: 'Frecuencia de pago (A = Anual, M = Mensual, etc.).' })
  @IsIn(['A', 'S', 'T', 'M', 'E'])
  ifrecuencia: string;


  @ApiPropertyOptional({ example: [1], type: [Number], description: 'Arreglo de IDs de dispositivos de seguridad seleccionados.' })
  @IsOptional()
  @IsArray()
  dispositivos?: number[];

  @ApiPropertyOptional({ example: [], type: [Number], description: 'Arreglo de IDs de sustancias peligrosas declaradas.' })
  @IsOptional()
  @IsArray()
  sustancias?: number[];
}
