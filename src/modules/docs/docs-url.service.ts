import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  joinPublicPath,
  normalizePublicPrefix,
  stripLeadingSlash,
} from '../../common/config/public-path';

@Injectable()
export class DocsUrlService {
  constructor(private readonly config: ConfigService) {}

  buildClientDocsPath(docsSlug: string): string {
    const swaggerPath = stripLeadingSlash(
      this.config.get<string>('SWAGGER_PATH', 'docs'),
    );
    const prefix = normalizePublicPrefix(
      this.config.get<string>('PUBLIC_API_PREFIX'),
    );
    return joinPublicPath(prefix, swaggerPath, 'client', docsSlug);
  }

  buildClientDocsUrl(docsSlug: string): string {
    const path = this.buildClientDocsPath(docsSlug);
    const origin = String(this.config.get<string>('PUBLIC_API_ORIGIN') ?? '')
      .trim()
      .replace(/\/+$/, '');
    const port = this.config.get<number>('PORT', 3001);

    if (origin) {
      return `${origin}${path}`;
    }

    return `http://localhost:${port}${path}`;
  }
}
