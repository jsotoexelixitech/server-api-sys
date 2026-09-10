import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class QuoteGenericPolicyDto {
  @ApiProperty({
    description: 'ID del producto (ramo) creado en proyecto-product-builder',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({
    description: 'Nombre exacto del plan comercial del producto. Si se omite, usa el primero (isRecommended o el de mayor prioridad).',
    example: 'Plan Estándar',
  })
  @IsOptional()
  @IsString()
  planName?: string;
}
