import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateEmissionPersonDto } from '../../personas/dto/create-emission-person.dto';
import { CanalViajeroDto, GestorViajeroDto } from './canal-viajero.dto';

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
    description: 'Si se envía, debe ser exactamente 3 o 7 según el endpoint. Si no, 400.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ndias?: number;

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

  @ApiPropertyOptional({
    type: GestorViajeroDto,
    description: 'Alias SysIP marketplace: gestor.ccanalalt / cscanalalt / cgestor.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GestorViajeroDto)
  gestor?: GestorViajeroDto;

  @ApiPropertyOptional({ example: 'C', description: 'Marketplace: P productor · C canal · G gestor.' })
  @IsOptional()
  @IsString()
  centidad?: string;

  @ApiPropertyOptional({ description: 'Marketplace: productor si P, canal si C, gestor si G.' })
  @IsOptional()
  citem?: string | number;

  @ApiPropertyOptional({ description: 'Subcanal marketplace (query csub).' })
  @IsOptional()
  csub?: string | number;
}
