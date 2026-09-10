import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/** Body opcional: si envía fdesde, se calcula fhasta = fdesde + 2 (3 días). */
export class GetViaje3PlanDto {
  @ApiPropertyOptional({
    example: '2026-09-04',
    description: 'Inicio de vigencia. Si se omite, se usa la fecha de hoy (UTC).',
  })
  @IsOptional()
  @IsDateString()
  fdesde?: string;
}
