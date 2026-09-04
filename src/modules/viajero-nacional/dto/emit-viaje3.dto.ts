import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { CreateEmissionPersonDto } from '../../personas/dto/create-emission-person.dto';

/** Emisión VIAJE3: cramo y plan los fija el servidor (25 / VIAJE3). */
export class EmitViaje3Dto extends OmitType(CreateEmissionPersonDto, [
  'cramo',
  'plan',
] as const) {
  @ApiPropertyOptional({ example: 25, description: 'Ignorado: siempre 25.' })
  @IsOptional()
  @IsInt()
  cramo?: number;

  @ApiPropertyOptional({ example: 'VIAJE3', description: 'Ignorado: siempre VIAJE3.' })
  @IsOptional()
  @IsString()
  plan?: string;
}
