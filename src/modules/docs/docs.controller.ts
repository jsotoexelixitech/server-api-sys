import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiKeyService } from '../auth/api-key.service';
import { DocsUrlService } from './docs-url.service';
import { DocsViewNotFoundError, OpenApiFilterService } from './open-api-filter.service';

@ApiTags('Docs')
@ApiExcludeController()
@Controller('v1/docs')
@SkipEnvelope()
export class DocsController {
  constructor(
    private readonly filter: OpenApiFilterService,
    private readonly apiKeys: ApiKeyService,
    private readonly docsUrls: DocsUrlService,
  ) {}

  @Public()
  @Get('view/:docsSlug')
  @ApiOperation({ summary: 'OpenAPI filtrado por enlace de token (docsSlug)' })
  async viewBySlug(@Param('docsSlug') docsSlug: string) {
    const key = await this.apiKeys.findByDocsSlug(docsSlug);
    if (!key) throw new DocsViewNotFoundError();
    return this.filter.filterByScopes(key.scopes, key.name);
  }

  @Get('openapi')
  @ApiOperation({ summary: 'OpenAPI filtrado según scopes del Bearer/apikey actual' })
  openapi(@Req() req: Request) {
    const scopes = req.nestAuth?.scopes ?? [];
    return this.filter.filterByScopes(scopes);
  }

  @Public()
  @Get('client-base')
  @ApiOperation({ summary: 'Prefijo base para URLs de docs cliente (admin)' })
  clientBase() {
    const sample = this.docsUrls.buildClientDocsPath('sample');
    return {
      clientDocsPathPrefix: sample.replace(/sample$/, ''),
    };
  }
}
