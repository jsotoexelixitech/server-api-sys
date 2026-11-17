import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Alta de agencia (nivel 2) o asesor (nivel 3): gestor que cuelga de otro gestor
 * (intermediario, canal o agencia) y hereda su tipo de canal, canal y subcanal.
 */
export class CrearGestorDto {
  @ApiProperty({ example: '410948842', description: 'cgestor del padre (magestor.cgestor)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : String(value ?? '')))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  cgestor_padre!: string;

  @ApiProperty({ example: 'MARIA PEREZ', description: 'Nombre completo de la agencia o asesor' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  xgestor!: string;

  @ApiProperty({ example: 'asesor@empresa.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  xcorreo!: string;
}
