import { Module } from '@nestjs/common';
import { DocsController } from './docs.controller';
import { DocsUrlService } from './docs-url.service';
import { OpenApiDocumentStore } from './open-api-document.store';
import { OpenApiFilterService } from './open-api-filter.service';

@Module({
  controllers: [DocsController],
  providers: [OpenApiDocumentStore, OpenApiFilterService, DocsUrlService],
  exports: [OpenApiDocumentStore, DocsUrlService],
})
export class DocsModule {}
