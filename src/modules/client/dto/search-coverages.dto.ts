import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, Matches, Min } from 'class-validator';

export class SearchCoveragesDto {
  @ApiProperty({ example: '900000000065412', description: 'Número de póliza' })
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @Matches(/^\d{1,19}$/, { message: 'cpoliza debe tener entre 1 y 19 dígitos' })
  cpoliza: string;

  @ApiProperty({ example: 2025, description: 'Año de la póliza' })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  fanopol: number;

  @ApiProperty({ example: 9, description: 'Mes de la póliza' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fmespol: number;
}
