import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Ramos cuyo tarifario puede consultarse/editarse desde el tarificador de Técnica. */
export const TARIFICADOR_RAMOS = [16, 38] as const;

export class GetTarificadorDto {
  @ApiProperty({ example: 16, description: 'Ramo: 16 = Combinado Empresarial (Condominio), 38 = Combinado Residencial (Hogar).' })
  @Type(() => Number)
  @IsIn(TARIFICADOR_RAMOS as unknown as number[])
  cramo: number;

  @ApiPropertyOptional({ example: '1', description: 'Código de plan (opcional). Sin él se devuelven todos los planes vigentes.' })
  @IsOptional()
  @IsString()
  @MaxLength(6)
  cplan?: string;
}

/** Réplica de la tasa configurada en el tarificador hacia el tarifario del Core (matarifa_d). */
export class UpdateTarificadorTasaDto {
  @ApiProperty({ example: 16 })
  @Type(() => Number)
  @IsIn(TARIFICADOR_RAMOS as unknown as number[])
  cramo: number;

  @ApiProperty({ example: '26' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ccober: string;

  @ApiProperty({ example: '1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  ctarifa: string;

  @ApiProperty({ example: 0.15, description: 'Tasa en porcentaje (matarifa_d.pprima).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100)
  pprima: number;

  @ApiProperty({ example: 20364172, description: 'Código de usuario Sis2000 de quien modifica (auditoría cusuariomod).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cusuario: number;

  @ApiPropertyOptional({ example: 'Nombre Apellido', description: 'Nombre del usuario, solo para el log.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  xusuario?: string;
}
