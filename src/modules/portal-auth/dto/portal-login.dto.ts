import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body de POST /v1/portal/login (mismo contrato que SysIP `POST /auth/signIn`). */
export class PortalLoginDto {
  @ApiProperty({ example: 'usuario.canal', description: 'seusuariosweb.xlogin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  xlogin!: string;

  @ApiProperty({ example: '********', description: 'seusuariosweb.xcontrasena' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  xcontrasena!: string;
}
