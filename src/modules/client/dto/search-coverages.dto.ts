import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class SearchCoveragesDto {
  @ApiProperty({ example: '900000000065412', description: 'Número de póliza (`adpoliza.cpoliza`)' })
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  cpoliza: number;

  @ApiProperty({ example: 2025, description: 'Año de la póliza (`adpoliza.fanopol`)' })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  fanopol: number;

  @ApiProperty({ example: 9, description: 'Mes de la póliza (`adpoliza.fmespol`)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fmespol: number;
}
