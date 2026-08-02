import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class AnularPolizaDto {
  @ApiProperty({ example: '18-1-0000079163', description: 'Número de póliza a anular' })
  @IsString()
  cnpoliza: string;

  @ApiProperty({ example: 2026, description: 'Año de la póliza (fanopol)' })
  @IsInt()
  fanopol: number;

  @ApiProperty({ example: 8, description: 'Mes de la póliza (fmespol)' })
  @IsInt()
  fmespol: number;

  @ApiPropertyOptional({ example: '2026-08-02', description: 'Fecha efectiva de la anulación' })
  @IsOptional()
  @IsString()
  fanulacion?: string;

  @ApiPropertyOptional({ example: 1, description: 'Causal de anulación (canula)' })
  @IsOptional()
  @IsInt()
  canulacion?: number;

  @ApiPropertyOptional({ example: 1422, description: 'ID del usuario operador' })
  @IsOptional()
  @IsInt()
  cusuario?: number;
}
