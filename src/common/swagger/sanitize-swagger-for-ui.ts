/**
 * NestJS Swagger embebe el documento con:
 *   jsTemplateString.replace('<% swaggerOptions %>', json)
 * En el string de reemplazo, `$'` `$`` `$&` `$$` son patrones especiales de
 * String.prototype.replace y rompen swagger-ui-init.js (SyntaxError).
 *
 * Duplicamos cada `$` en strings del OpenAPI para que, tras el replace de Nest,
 * quede un solo `$` en el JS generado.
 */
export function sanitizeSwaggerDocForNestUi<T>(doc: T): T {
  return walk(doc) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.includes('$') ? value.replace(/\$/g, '$$$$') : value;
  }
  if (Array.isArray(value)) {
    return value.map(walk);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = walk(child);
    }
    return out;
  }
  return value;
}
