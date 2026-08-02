import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AsientoContableEndosoDto {
  @ApiProperty({ example: '18-10001', description: 'Número de recibo (cnrecibo)' })
  @IsString()
  cnrecibo: string;

  @ApiProperty({ example: 87.5, description: 'Monto pagado en divisas (USD)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mpagadoext: number;

  @ApiPropertyOptional({ example: '2026-08-02', description: 'Fecha de cobro (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  fcobro?: string;

  @ApiPropertyOptional({ example: 'BANCO MERCANTIL', description: 'Nombre de la entidad bancaria' })
  @IsOptional()
  @IsString()
  xbanco?: string;

  @ApiPropertyOptional({ example: 'REF-987654321', description: 'Referencia bancaria o voucher' })
  @IsOptional()
  @IsString()
  xreferencia?: string;

  @ApiPropertyOptional({ example: 1422, description: 'ID del usuario operador' })
  @IsOptional()
  @IsInt()
  cusuario?: number;
}
