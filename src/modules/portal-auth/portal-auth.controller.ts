import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { PortalLoginDto } from './dto/portal-login.dto';
import { PortalAuthService } from './portal-auth.service';

@ApiTags(SWAGGER_TAGS.AUTH)
@Controller('v1/portal')
export class PortalAuthController {
  constructor(private readonly portalAuth: PortalAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @NestProtected(NEST_AUTH_SCOPES.PORTAL_LOGIN)
  @ApiOperation({
    summary: 'Login portal La Mundial (usuarios Sis2000 / marketplace)',
    description:
      'Valida xlogin/xcontrasena contra seusuariosweb (igual que SysIP `auth/signIn`) y devuelve el perfil ' +
      '(centidad/citem) más `catalogo`: la entidad con la que el marketplace carga productos. ' +
      'Para gestores, enviar `catalogo` a `POST /valrep/productos/marketplace` con `cgestor` y `filtrar_gestor: true`. ' +
      'No emite token de usuario. Requiere scope `portal:login`.',
    operationId: 'portalLogin',
  })
  @ApiBody({ type: PortalLoginDto })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: true,
        data: {
          usuario: {
            cusuario: 1234,
            xusuario: 'GESTOR CANAL',
            xlogin: 'usuario.canal',
            centidad: 'G',
            citem: '1234',
            cgestor: '80080-3',
            ccanalalt: '15',
            bcambioclave: false,
          },
          catalogo: { centidad: 'C', citem: '15', cgestor: '80080-3', filtrar_gestor: true },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Usuario o contraseña inválidos.' })
  @ApiCommonErrors()
  async login(@Body() dto: PortalLoginDto) {
    const data = await this.portalAuth.login(dto);
    return { status: true, data };
  }
}
