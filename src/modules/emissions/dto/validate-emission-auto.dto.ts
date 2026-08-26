import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateEmissionAutoDto {
  @ApiPropertyOptional({
    example: 'RCVBAS',
    description:
      'Código del plan. Opcional en validación temprana (antes de elegir plan): si se omite, se usa el plan por defecto. ' +
      'En emisión debe coincidir con el plan cotizado.',
  })
  @IsOptional()
  @IsString({ message: 'El plan debe ser texto.' })
  @MaxLength(6, { message: 'El plan no debe exceder 6 caracteres.' })
  plan?: string;

  @ApiProperty({ example: 'AE886C', description: 'Placa del vehículo' })
  @IsString({ message: 'La placa debe ser texto.' })
  @IsNotEmpty({ message: 'La placa es requerida.' })
  @MaxLength(8, { message: 'La placa no debe exceder 8 caracteres.' })
  placa: string;

  @ApiProperty({
    example: 'SC1S6ZMV3024323',
    description: 'Serial de carrocería del carnet de circulación (campo obligatorio junto con la placa).',
  })
  @IsString({ message: 'El serial de carrocería debe ser texto.' })
  @IsNotEmpty({ message: 'El serial de carrocería es requerido.' })
  @MaxLength(30, { message: 'El serial de carrocería no debe exceder 30 caracteres.' })
  serial_carroceria: string;
}
