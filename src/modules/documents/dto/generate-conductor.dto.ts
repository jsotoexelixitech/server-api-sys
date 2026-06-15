import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class GenerateConductorPdfDto {
  @ApiProperty({ example: '18-1-100061559', description: 'Número de póliza' })
  @IsString()
  poliza: string;

  @ApiProperty({ example: '0', description: 'Número de certificado' })
  @IsString()
  certificado: string;

  @ApiProperty({ example: '15 de junio de 2026', description: 'Fecha de emisión del anexo' })
  @IsString()
  fechaEmision: string;

  @ApiProperty({ example: 'Caracas', description: 'Sucursal o Agencia' })
  @IsString()
  sucursal: string;

  @ApiPropertyOptional({ example: '80080 - LA MUNDIAL DE SEGUROS', description: 'Código del Intermediario' })
  @IsOptional()
  @IsString()
  intermediario?: string;

  @ApiProperty({ example: 'Edward Villa', description: 'Nombre y apellido del tomador' })
  @IsString()
  tomadorNombre: string;

  @ApiProperty({ example: 'V-14454275', description: 'Cédula o RIF del tomador' })
  @IsString()
  tomadorRif: string;

  @ApiProperty({ example: '15 de junio de 2026', description: 'Inicio de vigencia' })
  @IsString()
  vigenciaDesde: string;

  @ApiProperty({ example: '15 de junio de 2027', description: 'Fin de vigencia' })
  @IsString()
  vigenciaHasta: string;

  @ApiProperty({ example: 'Juana cortez', description: 'Nombre y apellido del conductor habitual' })
  @IsString()
  conductorNombre: string;

  @ApiProperty({ example: 'V-17212231', description: 'Cédula o RIF del conductor habitual' })
  @IsString()
  conductorRif: string;
}
