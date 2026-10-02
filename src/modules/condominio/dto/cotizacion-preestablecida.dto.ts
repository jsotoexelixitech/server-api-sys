import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

/** Una cobertura ya calculada (valores ANUALES; el Core los reparte entre las cuotas al emitir). */
export class CotizacionCoberturaDto {
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

  @ApiProperty({ example: 4000, description: 'Suma asegurada de la cobertura (USD).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  suma_asegurada: number;

  @ApiProperty({ example: 6, description: 'Prima bruta = suma × tasa / 100.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  prima_bruta: number;

  @ApiProperty({ example: 0.48, description: 'Descuento por dispositivos de seguridad.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuento: number;

  @ApiProperty({ example: 0.6, description: 'Recargo por sustancias peligrosas.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recargo: number;

  @ApiProperty({ example: 6.12, description: 'Prima neta = bruta - descuento + recargo.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  prima: number;

  @ApiPropertyOptional({ example: 20, description: 'Porcentaje de comisión aplicado (maarancel).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  pcomision?: number;

  @ApiPropertyOptional({ example: 1.22, description: 'Comisión = prima neta × pcomision / 100.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  comision?: number;
}

/**
 * Cotización calculada por el producto (Condominio u Hogar) con el tarificador.
 * Si se envía en la emisión, el Core NO recalcula: valida que cuadre con sus tarifas y emite estos valores.
 */
export class CotizacionPreestablecidaDto {
  @ApiProperty({ example: 160000, description: 'Suma asegurada elegida (= cobertura básica).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  suma_asegurada: number;

  @ApiProperty({ example: 180, description: 'Prima total anual de la póliza (suma de primas netas).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  prima_total: number;

  @ApiPropertyOptional({ example: 8, description: 'Porcentaje total de descuento por dispositivos aplicado.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  descuento_pct?: number;

  @ApiPropertyOptional({ example: 10, description: 'Porcentaje total de recargo por sustancias aplicado.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  recargo_pct?: number;

  @ApiProperty({ type: [CotizacionCoberturaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CotizacionCoberturaDto)
  coberturas: CotizacionCoberturaDto[];
}
