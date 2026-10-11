import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, Min } from 'class-validator';
import { RAMOS_AUTO } from '../vehicle-policy-search';

const aEnteros = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean).map(Number) : value;

export class SearchCausasDto {
  @ApiProperty({ example: 18, description: 'Ramo de la póliza (18 = Automóvil, 26 = RCV)' })
  @Transform(({ value }) => Number(value))
  @IsIn([...RAMOS_AUTO])
  cramo: number;

  @ApiProperty({ example: '1,2,7', description: 'Códigos de cobertura contratados, separados por coma' })
  @Transform(aEnteros)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ccoberturas: number[];
}
