import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class CollectionPaymentDto {
  @ApiProperty({
    example: '18-100272044',
    description: 'Número de recibo Sis2000 (`cnrecibo`) devuelto por `createEmissionAuto`.',
  })
  @IsString()
  @IsNotEmpty()
  cnrecibo: string;

  @ApiProperty({
    example: 7.24,
    description:
      'Monto pagado en bolívares (Bs) según verificación bancaria / pago móvil. ' +
      'Debe coincidir con el cobro del recibo.',
  })
  @Type(() => Number)
  @IsNumber()
  mpago: number;

  @ApiProperty({
    example: '219551279300',
    description:
      'Referencia bancaria del pago verificado. Debe existir en `pago_movil` o `trsypago`. ' +
      'No usar IDs internos Exélixi (INT-...).',
  })
  @IsString()
  @IsNotEmpty()
  xreferencia: string;

  @ApiProperty({
    example: '2026-07-14',
    description: 'Fecha del pago (YYYY-MM-DD). Alimenta `freporte` en el ingreso de caja.',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fpago: string;

  @ApiPropertyOptional({
    example: 7,
    description:
      'ID de usuario Sis2000 (`seusuariosweb.cusuario`) que aparece como Cajero en el PDF. ' +
      'SysIP canales externos usa 7. Si se omite, se resuelve desde configuración del canal.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cusuario?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Código `cbanco` en `mabanco` (banco origen). Opcional si se envía `cbanco_ref`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cbanco?: number;

  @ApiPropertyOptional({
    example: '0134',
    description:
      'Código ref. del banco origen (`pago_movil.banco_origen`). ' +
      'Se resuelve a `cbanco` vía `mabanco` (ej. 0134 → BANCO MERCANTIL).',
  })
  @IsOptional()
  @IsString()
  cbanco_ref?: string;

  @ApiPropertyOptional({
    example: 35,
    description:
      'Código `cbanco_destino` para `MABANCO_DESTINO`. Pago móvil = 35, SyPago = 31. ' +
      'Si se omite, se infiere de la referencia en `pago_movil`/`trsypago`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cbanco_destino?: number;

  @ApiPropertyOptional({ example: '584243678907', description: 'Teléfono origen del pago móvil verificado' })
  @IsOptional()
  @IsString()
  xtelefono?: string;

  @ApiPropertyOptional({ example: '04143966962', description: 'Teléfono destino La Mundial del pago móvil' })
  @IsOptional()
  @IsString()
  telefono_dest?: string;

  @ApiPropertyOptional({ example: 'V-24174934', description: 'Cédula/RIF del pagador (pago móvil)' })
  @IsOptional()
  @IsString()
  cci_rif?: string;

  @ApiPropertyOptional({ example: '0171', description: 'Código ref. banco destino (banco_destino en pago_movil)' })
  @IsOptional()
  @IsString()
  cbanco_dest_ref?: string;
}
