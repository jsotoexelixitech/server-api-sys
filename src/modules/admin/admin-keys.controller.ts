import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiKeyService } from '../auth/api-key.service';
import {
  buildRouteCatalog,
  expandGrantsToRoutes,
} from '../auth/scopes/scope-catalog.registry';
import { DocsUrlService } from '../docs/docs-url.service';
import { AdminTokenGuard } from './admin-token.guard';
import { CreateAdminKeyDto, UpdateAdminKeyDto } from './dto/admin-key.dto';

@ApiTags('Admin — API Keys')
@ApiExcludeController()
@Controller('v1/admin')
@Public()
@SkipEnvelope()
@UseGuards(AdminTokenGuard)
export class AdminKeysController {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly docsUrls: DocsUrlService,
  ) {}

  private withDocsUrl<T extends { docsSlug?: string | null }>(key: T) {
    return {
      ...key,
      docsUrl: key.docsSlug
        ? this.docsUrls.buildClientDocsUrl(key.docsSlug)
        : null,
    };
  }

  private buildRouteDetails(scopes: string[]) {
    const expanded = expandGrantsToRoutes(scopes);
    const catalog = buildRouteCatalog();
    return expanded.map((routeId) => {
      const meta = catalog.find((entry) => entry.routeId === routeId);
      return (
        meta ?? {
          routeId,
          scopeId: routeId,
          scopeLabel: 'Ruta',
          description: '',
        }
      );
    });
  }

  private buildAccessSummary(scopes: string[]) {
    const routeDetails = this.buildRouteDetails(scopes);
    return {
      catalogOnly: !(scopes?.length),
      grantCount: scopes?.length ?? 0,
      routeCount: routeDetails.length,
    };
  }

  @Get('scopes')
  @ApiOperation({ summary: 'Catálogo de endpoints protegidos (uno a uno)' })
  listScopes() {
    return {
      scopes: this.apiKeys.getScopeCatalog(),
      routes: buildRouteCatalog(),
    };
  }

  @Get('keys')
  @ApiOperation({ summary: 'Listar API keys (sin secreto)' })
  async listKeys() {
    const keys = await this.apiKeys.listKeys();
    return { keys: keys.map((key) => this.withDocsUrl(key)) };
  }

  @Post('keys')
  @ApiOperation({ summary: 'Crear API key — devuelve plainKey una sola vez' })
  async createKey(@Body() dto: CreateAdminKeyDto) {
    const result = await this.apiKeys.createKey({
      name: dto.name,
      scopes: dto.scopes,
      cproductor: dto.cproductor,
      ccanalalt: dto.ccanalalt,
      cscanalalt: dto.cscanalalt,
      ctipocanal: dto.ctipocanal,
      xcanalVenta: dto.xcanal_venta,
      expiresAt: dto.expires_at ? new Date(dto.expires_at) : undefined,
    });
    return {
      message: 'Guarde plainKey — no se volverá a mostrar.',
      plainKey: result.plainKey,
      key: this.withDocsUrl(result.key),
      docsUrl: result.key.docsSlug
        ? this.docsUrls.buildClientDocsUrl(result.key.docsSlug)
        : null,
    };
  }

  @Get('keys/:id')
  @ApiOperation({ summary: 'Detalle de API key con scopes enriquecidos' })
  async getKey(@Param('id') id: string) {
    const key = await this.apiKeys.findById(id);
    if (!key) throw new NotFoundException('API key no encontrada.');

    const routeDetails = this.buildRouteDetails(key.scopes);
    return {
      key: this.withDocsUrl(key),
      routeDetails,
      scopeDetails: routeDetails,
      accessSummary: this.buildAccessSummary(key.scopes),
    };
  }

  @Patch('keys/:id')
  @ApiOperation({ summary: 'Editar nombre, rutas permitidas, canal o reactivar key' })
  async updateKey(@Param('id') id: string, @Body() dto: UpdateAdminKeyDto) {
    const key = await this.apiKeys.updateKey(id, {
      name: dto.name,
      scopes: dto.scopes,
      active: dto.active,
      cproductor: dto.cproductor,
      ccanalalt: dto.ccanalalt,
      cscanalalt: dto.cscanalalt,
      ctipocanal: dto.ctipocanal,
      xcanalVenta: dto.xcanal_venta,
    });
    const enriched = this.withDocsUrl(key);
    const routeDetails = this.buildRouteDetails(key.scopes);
    return {
      key: enriched,
      routeDetails,
      scopeDetails: routeDetails,
    };
  }

  @Post('keys/:id/revoke')
  async revokeKey(@Param('id') id: string) {
    const key = await this.apiKeys.revokeKey(id);
    return { key: this.withDocsUrl(key) };
  }
}
