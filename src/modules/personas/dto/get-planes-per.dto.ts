import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

function optionalString({ value }: { value: unknown }): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value).trim() || undefined;
}

export class GetPlanesPerDto {
  @ApiPropertyOptional({
    example: 45,
    description: 'Código de ramo (9 = funerario genérico; 45 con cproducto 57).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cramo?: number;

  @ApiPropertyOptional({
    example: null,
    description: 'Tipo (opcional). Normalmente null para personas.',
  })
  @IsOptional()
  @IsInt()
  ctipo?: number | null;

  @ApiPropertyOptional({
    example: '80080',
    description: 'Ítem Sis2000 del canal SSO (productor o comercializador).',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  citem?: string;

  @ApiPropertyOptional({
    example: 'C',
    description: 'Entidad Sis2000: P = productor, C = canal, G = gestor. U (usuario) se resuelve vía magestor.',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  centidad?: string;

  @ApiPropertyOptional({
    example: '57',
    description: 'Producto funerario del JWT. Si falta, se resuelve con spBuscaProductosEntidad.',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  cproducto?: string;

  @ApiPropertyOptional({
    example: '80080',
    description: 'Productor SSO. Fallback a LAMUNDIAL_PRODUCTOR si no hay citem/centidad.',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  cproductor?: string;

  @ApiPropertyOptional({
    example: '7',
    description: 'Usuario Sis2000 del JWT (mismo parámetro que RCV / spBuscaPlan).',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  cusuario?: string;

  @ApiPropertyOptional({
    example: 'marismendi@lamundialdeseguros.com',
    description: 'Correo del gestor marketplace (magestor.xcorreo). Resuelve U → C/P.',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  cgestor_in?: string;

  @ApiPropertyOptional({
    example: '80080-27-0',
    description: 'Código magestor (marketplace /usuario/:id).',
  })
  @IsOptional()
  @Transform(optionalString)
  @IsString()
  cgestor?: string;
}
