import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class AnularRecibosDto {
  @ApiProperty({
    example: ['18-10001', '18-10002'],
    description: 'Lista de números de recibo (cnrecibo) a anular',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  recibos: string[];

  @ApiPropertyOptional({ example: '2026-08-02', description: 'Fecha de anulación (ISO YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  fanulacion?: string;

  @ApiPropertyOptional({ example: 1422, description: 'ID del usuario operador' })
  @IsOptional()
  @IsInt()
  cusuario?: number;
}
