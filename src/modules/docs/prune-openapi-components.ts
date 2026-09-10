import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces';

type Components = NonNullable<OpenAPIObject['components']>;

/** Recolecta `$ref` a `#/components/...` en un subárbol OpenAPI. */
export function collectComponentRefs(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectComponentRefs(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const ref = obj.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/components/')) {
    out.add(ref);
  }
  for (const value of Object.values(obj)) {
    collectComponentRefs(value, out);
  }
}

function parseComponentRef(
  ref: string,
): { section: keyof Components; name: string } | null {
  const match = ref.match(/^#\/components\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const section = match[1] as keyof Components;
  const name = decodeURIComponent(match[2]);
  return { section, name };
}

/**
 * Deja en `components` solo lo referenciado (directa o transitivamente)
 * por `roots` (paths filtrados, etc.). Conserva `securitySchemes` para Authorize.
 */
export function pruneOpenApiComponents(
  sourceComponents: OpenAPIObject['components'] | undefined,
  roots: unknown[],
): OpenAPIObject['components'] | undefined {
  if (!sourceComponents) return undefined;

  const pending = new Set<string>();
  for (const root of roots) {
    collectComponentRefs(root, pending);
  }

  const kept = new Set<string>();
  const queue = [...pending];

  while (queue.length > 0) {
    const ref = queue.pop()!;
    if (kept.has(ref)) continue;
    kept.add(ref);

    const parsed = parseComponentRef(ref);
    if (!parsed) continue;
    const sectionBag = sourceComponents[parsed.section] as
      | Record<string, unknown>
      | undefined;
    const def = sectionBag?.[parsed.name];
    if (!def) continue;

    const nested = new Set<string>();
    collectComponentRefs(def, nested);
    for (const nestedRef of nested) {
      if (!kept.has(nestedRef)) queue.push(nestedRef);
    }
  }

  const pruned: Record<string, Record<string, unknown>> = {};
  for (const ref of kept) {
    const parsed = parseComponentRef(ref);
    if (!parsed) continue;
    const sectionBag = sourceComponents[parsed.section] as
      | Record<string, unknown>
      | undefined;
    const def = sectionBag?.[parsed.name];
    if (def === undefined) continue;
    if (!pruned[parsed.section]) pruned[parsed.section] = {};
    pruned[parsed.section][parsed.name] = def;
  }

  if (sourceComponents.securitySchemes) {
    pruned.securitySchemes = sourceComponents.securitySchemes as Record<
      string,
      unknown
    >;
  }

  return Object.keys(pruned).length > 0
    ? (pruned as Components)
    : sourceComponents.securitySchemes
      ? ({ securitySchemes: sourceComponents.securitySchemes } as Components)
      : undefined;
}
