import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateEmissionPersonDto } from '../../personas/dto/create-emission-person.dto';
import { CanalViajeroDto } from './canal-viajero.dto';

/** Emisión viajero fijo: cramo y plan los fija el servidor. Canal opcional en el body. */
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

  @ApiPropertyOptional({
    type: CanalViajeroDto,
    description: 'Canal Sis2000 en el JSON (API aislada, no JWT). También se aceptan los mismos campos planos.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CanalViajeroDto)
  canal?: CanalViajeroDto;

  @ApiPropertyOptional({ example: 80080, description: 'Alias plano de canal.cproductor.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cproductor?: number;

  @ApiPropertyOptional({ description: 'Alias plano de canal.ccanalalt.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ccanalalt_in?: number | null;

  @ApiPropertyOptional({ description: 'Alias plano de canal.cscanalalt.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cscanalalt_in?: number | null;

  @ApiPropertyOptional({ description: 'Gestor Sis2000 (plano).' })
  @IsOptional()
  @IsString()
  cgestor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cgestor_in?: string;
}
