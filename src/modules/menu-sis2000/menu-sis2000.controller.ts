import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { GuardarOpcionDto, GuardarPlantillaDto, GuardarPrincipalDto, SubirIconoDto } from './dto/guardar-menu.dto';
import { MenuIconosService } from './menu-iconos.service';
import { MenuSis2000Service } from './menu-sis2000.service';

const OPERADOR_HEADER = {
  name: 'x-sis2000-cusuario',
  required: true,
  description: 'cusuario de Sis2000 que opera; debe ser del departamento de Desarrollo (2)',
};

@ApiTags('Menú lateral (Sis2000)')
@ApiHeader(APIKEY_HEADER)
@ApiHeader(OPERADOR_HEADER)
@ApiResponse({ status: 403, description: 'El operador no es del departamento de Desarrollo (root).' })
@NestProtected(NEST_AUTH_SCOPES.MENU_SIS2000_ADMIN)
@Controller('v1/menu-sis2000')
export class MenuSis2000Controller {
  constructor(
    private readonly menu: MenuSis2000Service,
    private readonly iconos: MenuIconosService,
  ) {}

  @Post('iconos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Subir un ícono SVG propio para un grupo del menú',
    description: 'Devuelve la referencia corta (svg:<id>) para guardar en xicono. Rechaza scripts, eventos y enlaces externos.',
  })
  async subirIcono(@Headers('x-sis2000-cusuario') operador: string, @Body() dto: SubirIconoDto) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, message: 'Ícono guardado.', data: await this.iconos.guardar(dto.svg) };
  }

  /** Público: el menú lateral lo carga como imagen (mask-image), sin apikey. */
  @Get('iconos/:id')
  @Public()
  @ApiOperation({ summary: 'Ícono SVG del menú (público, como imagen)' })
  async verIcono(@Param('id') id: string, @Res() res: Response) {
    const svg = await this.iconos.leer(id);
    res
      .set({
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        // Si se abre el SVG directo en el navegador no puede ejecutar nada
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Cross-Origin-Resource-Policy': 'cross-origin',
      })
      .send(svg);
  }

  @Get('arbol')
  @ApiOperation({ summary: 'Desplegables y opciones del menú (activos e inactivos)' })
  async arbol(@Headers('x-sis2000-cusuario') operador: string) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, data: await this.menu.arbol() };
  }

  @Get('roles')
  @ApiOperation({ summary: 'Departamentos y roles, con usuarios activos de cada uno' })
  async roles(@Headers('x-sis2000-cusuario') operador: string) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, data: await this.menu.roles() };
  }

  @Get('plantilla')
  @ApiOperation({ summary: 'Opciones asignadas a un rol (o a un usuario con plantilla propia)' })
  @ApiQuery({ name: 'cdepartamento', type: Number })
  @ApiQuery({ name: 'crol', type: Number })
  @ApiQuery({ name: 'cusuario', type: Number, required: false })
  async plantilla(
    @Headers('x-sis2000-cusuario') operador: string,
    @Query('cdepartamento', ParseIntPipe) cdepartamento: number,
    @Query('crol', ParseIntPipe) crol: number,
    @Query('cusuario') cusuario?: string,
  ) {
    await this.menu.asegurarRoot(Number(operador));
    const usuario = cusuario ? Number(cusuario) : undefined;
    return { status: true, data: await this.menu.plantilla(cdepartamento, crol, usuario) };
  }

  @Put('plantilla')
  @ApiOperation({
    summary: 'Guardar permisos de menú de un rol (o de un usuario)',
    description:
      'spMenuGuardarPlantilla: reescribe semenuparam. La plantilla de rol la toman los usuarios nuevos; ' +
      'a los existentes solo con aplicarAExistentes=true. La de un usuario se aplica a ese usuario.',
  })
  async guardarPlantilla(@Headers('x-sis2000-cusuario') operador: string, @Body() dto: GuardarPlantillaDto) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, message: 'Permisos de menú guardados.', data: await this.menu.guardarPlantilla(dto, Number(operador)) };
  }

  @Post('principal')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear desplegable (semenuprincipal)' })
  async crearPrincipal(@Headers('x-sis2000-cusuario') operador: string, @Body() dto: GuardarPrincipalDto) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, message: 'Menú creado.', data: await this.menu.guardarPrincipal(dto, Number(operador)) };
  }

  @Patch('principal/:cmenuPrincipal')
  @ApiOperation({ summary: 'Editar o activar/desactivar un desplegable' })
  async editarPrincipal(
    @Headers('x-sis2000-cusuario') operador: string,
    @Param('cmenuPrincipal', ParseIntPipe) cmenuPrincipal: number,
    @Body() dto: GuardarPrincipalDto,
  ) {
    await this.menu.asegurarRoot(Number(operador));
    return {
      status: true,
      message: 'Menú actualizado.',
      data: await this.menu.guardarPrincipal(dto, Number(operador), cmenuPrincipal),
    };
  }

  @Post('opcion')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear opción dentro de un desplegable (semenu)' })
  async crearOpcion(@Headers('x-sis2000-cusuario') operador: string, @Body() dto: GuardarOpcionDto) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, message: 'Opción creada.', data: await this.menu.guardarOpcion(dto, Number(operador)) };
  }

  @Patch('opcion/:cmenu')
  @ApiOperation({ summary: 'Editar, mover o activar/desactivar una opción' })
  async editarOpcion(
    @Headers('x-sis2000-cusuario') operador: string,
    @Param('cmenu', ParseIntPipe) cmenu: number,
    @Body() dto: GuardarOpcionDto,
  ) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, message: 'Opción actualizada.', data: await this.menu.guardarOpcion(dto, Number(operador), cmenu) };
  }

  @Get('usuarios')
  @ApiOperation({ summary: 'Buscar usuarios de Sis2000 (login, nombre, cusuario o ccorredor)' })
  @ApiQuery({ name: 'q', required: true, description: 'Mínimo 2 caracteres' })
  async buscarUsuarios(@Headers('x-sis2000-cusuario') operador: string, @Query('q') q: string) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, data: await this.menu.buscarUsuarios(q) };
  }

  @Get('usuarios/:cusuario/menu')
  @ApiOperation({ summary: 'Menú efectivo de un usuario (sedistribucionmenu)' })
  async menuDeUsuario(
    @Headers('x-sis2000-cusuario') operador: string,
    @Param('cusuario', ParseIntPipe) cusuario: number,
  ) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, data: await this.menu.menuDeUsuario(cusuario) };
  }

  @Post('usuarios/:cusuario/sincronizar')
  @ApiOperation({ summary: 'Rehacer el menú de un usuario desde su plantilla' })
  async sincronizar(
    @Headers('x-sis2000-cusuario') operador: string,
    @Param('cusuario', ParseIntPipe) cusuario: number,
  ) {
    await this.menu.asegurarRoot(Number(operador));
    return { status: true, message: 'Menú sincronizado.', data: await this.menu.sincronizarUsuario(cusuario, Number(operador)) };
  }
}
