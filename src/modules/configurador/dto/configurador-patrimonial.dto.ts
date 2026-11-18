import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Alta de un dispositivo de seguridad del ramo (madisseg). Sin cdisseg se asigna MAX+1 del ramo. */
export class DispositivoDto {
  @ApiPropertyOptional({ example: 4, description: 'Código (SMALLINT). Sin él: MAX(cdisseg)+1 del ramo.' })
  @IsOptional() @IsInt() @Min(1) @Max(32767) cdisseg?: number;
  @ApiProperty({ example: 'ALARMA MONITOREADA' })
  @Transform(recortar) @IsString() @MaxLength(60) xdisseg: string;
  @ApiProperty({ example: 10, description: '% de descuento (0 a 100).' })
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(100) pdisseg: number;
}

/** Edición de un dispositivo: solo los campos enviados. «Quitar» = pdisseg 0 (la tabla no tiene iestado). */
export class EditarDispositivoDto {
  @ApiPropertyOptional() @IsOptional() @Transform(recortar) @IsString() @MaxLength(60) xdisseg?: string;
  @ApiPropertyOptional({ description: '% de descuento (0 a 100).' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(100) pdisseg?: number;
}

/** Alta de una sustancia peligrosa del ramo (masustac). Sin csustanc se asigna MAX+1 del ramo. */
export class SustanciaDto {
  @ApiPropertyOptional({ example: 2, description: 'Código (SMALLINT). Sin él: MAX(csustanc)+1 del ramo.' })
  @IsOptional() @IsInt() @Min(1) @Max(32767) csustanc?: number;
  @ApiProperty({ example: 'INFLAMABLES' })
  @Transform(recortar) @IsString() @MaxLength(255) xsustanc: string;
  @ApiProperty({ example: 10, description: '% de recargo (0 a 100).' })
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) porcenta: number;
}

/** Edición de una sustancia: solo los campos enviados. «Quitar» = porcenta 0 (la tabla no tiene iestado). */
export class EditarSustanciaDto {
  @ApiPropertyOptional() @IsOptional() @Transform(recortar) @IsString() @MaxLength(255) xsustanc?: string;
  @ApiPropertyOptional({ description: '% de recargo (0 a 100).' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) porcenta?: number;
}
