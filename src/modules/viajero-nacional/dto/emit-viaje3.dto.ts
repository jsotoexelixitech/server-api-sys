import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { CreateEmissionPersonDto } from '../../personas/dto/create-emission-person.dto';

/** Emisión viajero fijo: cramo y plan los fija el servidor. */
export class EmitViaje3Dto extends OmitType(CreateEmissionPersonDto, [
  'cramo',
  'plan',
] as const) {
  @ApiPropertyOptional({ example: 25, description: 'Ignorado: lo fija el servidor.' })
  @IsOptional()
  @IsInt()
  cramo?: number;

  @ApiPropertyOptional({ description: 'Ignorado: lo fija el servidor.' })
  @IsOptional()
  @IsString()
  plan?: string;
}
