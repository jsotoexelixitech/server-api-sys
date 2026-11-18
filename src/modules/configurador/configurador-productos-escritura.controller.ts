import { Body, Controller, Param, Patch } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NestProtected } from '../auth/decorators/nest-protected.decorator';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { APIKEY_HEADER } from '../../common/swagger/api-docs.constants';
import { SWAGGER_TAGS } from '../../common/swagger/swagger-tags.constants';
import { ApiCommonErrors } from '../../common/swagger/api-error-responses';
import { ConfiguradorProductosEscrituraService } from './configurador-productos-escritura.service';
import { EditarProductoDto } from './dto/configurador-productos-escritura.dto';

const SCOPE = NEST_AUTH_SCOPES.CONFIGURADOR_WRITE;

/** Configurador fase 2: edición de productos (maproductos). El alta sigue en POST productos (sp_CrearProducto + UPDATE). */
@ApiTags(SWAGGER_TAGS.CONFIGURADOR)
@ApiHeader(APIKEY_HEADER)
@ApiCommonErrors()
@Controller('v1/configurador')
export class ConfiguradorProductosEscrituraController {
  constructor(private readonly productos: ConfiguradorProductosEscrituraService) {}

  @Patch('productos/:cproducto')
  @NestProtected(SCOPE)
  @ApiOperation({
    summary: 'Editar un producto (maproductos) del ramo indicado',
    description:
      'Requiere CONFIGURADOR_PRODUCTOS_ESCRITURA=1 (si no, 403). cramo en el cuerpo identifica la fila (no cambia cproducto ni cramo). ' +
      'Campos: xdescripcion_l, xdescripcion_c, xabreviatura, iproductor, icanal, igestor, xform, xdescripcion_prod, mmonto_inicial, ' +
      'norden, xfraccionamiento, xurl_presentacion (null vacía el campo). 404 si no existe en el ramo. Devuelve { antes, despues, advertencias }.',
    operationId: 'configuradorEditarProducto',
  })
  @ApiBody({ type: EditarProductoDto })
  async editar(@Param('cproducto') cproducto: string, @Body() dto: EditarProductoDto) {
    return { status: true, data: await this.productos.editar(cproducto, dto) };
  }
}
