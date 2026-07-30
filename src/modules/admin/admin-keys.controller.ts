import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiKeyService } from '../auth/api-key.service';
import { AdminTokenGuard } from './admin-token.guard';
import { CreateAdminKeyDto, UpdateAdminKeyDto } from './dto/admin-key.dto';

@ApiTags('Admin — API Keys')
@ApiExcludeController()
@Controller('v1/admin')
@Public()
@SkipEnvelope()
@UseGuards(AdminTokenGuard)
export class AdminKeysController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Get('scopes')
  @ApiOperation({ summary: 'Catálogo de scopes disponibles' })
  listScopes() {
    return { scopes: this.apiKeys.getScopeCatalog() };
  }

  @Get('keys')
  @ApiOperation({ summary: 'Listar API keys (sin secreto)' })
  async listKeys() {
    const keys = await this.apiKeys.listKeys();
    return { keys };
  }

  @Post('keys')
  @ApiOperation({ summary: 'Crear API key — devuelve plainKey una sola vez' })
  async createKey(@Body() dto: CreateAdminKeyDto) {
    const result = await this.apiKeys.createKey({
      name: dto.name,
      scopes: dto.scopes,
      cproductor: dto.cproductor,
      xcanalVenta: dto.xcanal_venta,
      expiresAt: dto.expires_at ? new Date(dto.expires_at) : undefined,
    });
    return {
      message: 'Guarde plainKey — no se volverá a mostrar.',
      plainKey: result.plainKey,
      key: result.key,
    };
  }

  @Patch('keys/:id')
  async updateKey(@Param('id') id: string, @Body() dto: UpdateAdminKeyDto) {
    const key = await this.apiKeys.updateKey(id, {
      name: dto.name,
      scopes: dto.scopes,
      active: dto.active,
    });
    return { key };
  }

  @Post('keys/:id/revoke')
  async revokeKey(@Param('id') id: string) {
    const key = await this.apiKeys.revokeKey(id);
    return { key };
  }
}
