import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Alta de canal Alterno (A) o Directo (D) con su gestor, como la "agencia master" A/D de la pasarela. */
export class CrearCanalDto {
  @ApiProperty({ example: 'A', enum: ['A', 'D'], description: 'A = Alterno · D = Directo' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['A', 'D'])
  ctipocanal!: string;

  @ApiProperty({ example: 'CANAL EJEMPLO', description: 'Nombre del canal (también nombre del gestor)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  xcanalalt!: string;

  @ApiProperty({ example: 'canal@empresa.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  xcorreo!: string;
}
