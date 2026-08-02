import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SearchPoliciesDto {
  @ApiPropertyOptional({ example: 18, description: 'Código del ramo (ej. 18 para Automóvil, 38 para Condominio)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cramo?: number;

  @ApiPropertyOptional({ example: '18-1-0000079163', description: 'Número de póliza exacto o parcial' })
  @IsOptional()
  @IsString()
  cnpoliza?: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Número de cédula o RIF del asegurado' })
  @IsOptional()
  @IsString()
  cedula?: string;

  @ApiPropertyOptional({ example: 'GABRIEL MONCADA', description: 'Nombre parcial o completo del cliente' })
  @IsOptional()
  @IsString()
  xcliente?: string;

  @ApiPropertyOptional({ example: 'BINAC', description: 'Código del plan' })
  @IsOptional()
  @IsString()
  cplan?: string;

  @ApiPropertyOptional({ example: 'V', description: 'Estado de la póliza (V=Vigente, N=Anulada)' })
  @IsOptional()
  @IsString()
  iestado?: string;

  @ApiPropertyOptional({ example: 1, description: 'Número de página (por defecto 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Límite de registros por página (por defecto 20)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
