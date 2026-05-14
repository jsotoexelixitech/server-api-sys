import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChangeClientDto {
  @ApiProperty({ example: '12345678', description: 'Cédula/RIF actual del cliente (llave de búsqueda)' })
  @IsString()
  @IsNotEmpty()
  old_cci_rif: string;

  @ApiPropertyOptional({ example: '12345678', description: 'Nuevo cédula/RIF (si se desea cambiar; omitir para mantener el mismo)' })
  @IsOptional()
  @IsString()
  cci_rif?: string;

  @ApiPropertyOptional({ example: 'JUAN', description: 'Nombre del cliente' })
  @IsOptional()
  @IsString()
  xnombre?: string;

  @ApiPropertyOptional({ example: 'PÉREZ', description: 'Apellido del cliente' })
  @IsOptional()
  @IsString()
  xapellido?: string;

  @ApiPropertyOptional({ example: 'JUAN PÉREZ', description: 'Nombre completo concatenado' })
  @IsOptional()
  @IsString()
  xcliente?: string;

  @ApiPropertyOptional({ example: '1990-01-15', description: 'Fecha de nacimiento (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fnacimiento?: string;

  @ApiPropertyOptional({ example: 'M', description: 'Sexo del cliente', enum: ['M', 'F'] })
  @IsOptional()
  @IsString()
  isexo?: string;

  @ApiPropertyOptional({ example: 'S', description: 'Estado civil del cliente', enum: ['S', 'C', 'V', 'D'] })
  @IsOptional()
  @IsString()
  iestado_civil?: string;

  @ApiPropertyOptional({ example: 'V', description: 'Tipo de cédula', enum: ['V', 'E', 'J', 'G', 'P'] })
  @IsOptional()
  @IsString()
  icedula?: string;

  @ApiPropertyOptional({ example: 'V', description: 'Indicador de persona natural/jurídica' })
  @IsOptional()
  @IsString()
  ipersona?: string;

  @ApiPropertyOptional({ example: 1, description: 'Código de estado de residencia (de /valrep/states)' })
  @IsOptional()
  @IsInt()
  cestado?: number;

  @ApiPropertyOptional({ example: 128, description: 'Código de ciudad de residencia (de /valrep/cities)' })
  @IsOptional()
  @IsInt()
  cciudad?: number;

  @ApiPropertyOptional({ example: '1010', description: 'Zona postal' })
  @IsOptional()
  @IsString()
  czona_postal?: string;

  @ApiPropertyOptional({ example: '04141234567', description: 'Teléfono del cliente' })
  @IsOptional()
  @IsString()
  xtelefono?: string;

  @ApiPropertyOptional({ example: 'Av Principal con Calle 5', description: 'Dirección de residencia' })
  @IsOptional()
  @IsString()
  xdireccion?: string;

  @ApiPropertyOptional({ example: 'juan@email.com', description: 'Correo electrónico del cliente' })
  @IsOptional()
  @IsString()
  xcorreo?: string;

  @ApiPropertyOptional({ example: '25221952', description: 'Código del usuario que realiza el cambio' })
  @IsOptional()
  @IsString()
  cusuario?: string;
}
