import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  value == null ? value : String(value).trim();

/** Datos de la póliza emitida con el enlace (lo envía emision-api tras emitir). */
export class MarcarEmitidaDto {
  @ApiProperty({ example: '18-1-1130480881', description: 'Número de póliza Sis2000 (cnpoliza).' })
  @Transform(trimString)
  @IsString()
  @MaxLength(30)
  cnpoliza!: string;

  @ApiPropertyOptional({ example: 100000000170430 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cpoliza?: number;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fanopol?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fmespol?: number;

  @ApiPropertyOptional({ example: 18459203, description: 'Cliente asegurado (maclient.cci_rif).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  casegurado?: number;

  @ApiPropertyOptional({ example: '2026-10-26 15:02:11', description: 'Fecha de emisión.' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(40)
  femision?: string;

  @ApiPropertyOptional({ example: '4829104851' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20)
  nfactura?: string;
}
