import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces';
import { SWAGGER_TAGS } from './swagger-tags.constants';

/** Alias legacy de partners (evita sección duplicada en Swagger UI). */
const SWAGGER_TAG_ALIASES: Record<string, string> = {
  Renovaciones: SWAGGER_TAGS.RENOVATIONS,
};

function normalizeTagName(tag: string): string {
  return SWAGGER_TAG_ALIASES[tag] ?? tag;
}

/** Unifica tags de operaciones y del array global del OpenAPI document. */
export function normalizeSwaggerDocumentTags(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== 'object') continue;
      const op = operation as { tags?: string[] };
      if (!Array.isArray(op.tags)) continue;
      op.tags = op.tags.map(normalizeTagName);
    }
  }

  if (Array.isArray(document.tags)) {
    const seen = new Set<string>();
    document.tags = document.tags
      .map((tag) => ({
        ...tag,
        name: normalizeTagName(tag.name),
      }))
      .filter((tag) => {
        if (seen.has(tag.name)) return false;
        seen.add(tag.name);
        return true;
      });
  }
}
