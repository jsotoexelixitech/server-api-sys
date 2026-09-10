import type { OpenAPIObject, PathItemObject, OperationObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/** Rutas partner Gestacio que reutilizan /external (no confundir con flujo funerario core). */
const EXTERNAL_PERSONAS_PATHS = [
  '/api/v1/external/getCotizacionPer',
  '/api/v1/external/validateEmissionPerson',
  '/api/v1/external/createEmissionPerson',
] as const;

const PASO_PREFIX = /^Paso\s*\d+\s*[·.•\-–—:]\s*/i;

function stripPasoLabel(text: string): string {
  return text.replace(PASO_PREFIX, '').trim();
}

/**
 * Quita "Paso N · …" de summaries/descriptions en /external/* personas
 * (homologación partner; el flujo numerado queda en /emision-personas del core).
 */
export function stripPasoLabelsFromExternalPersonasDoc(
  doc: OpenAPIObject,
): OpenAPIObject {
  const paths = doc.paths ?? {};
  for (const path of EXTERNAL_PERSONAS_PATHS) {
    const item = paths[path] as PathItemObject | undefined;
    if (!item) continue;
    for (const method of Object.keys(item)) {
      if (method.startsWith('x-') || method === 'parameters') continue;
      const op = (item as Record<string, unknown>)[method] as
        | OperationObject
        | undefined;
      if (!op || typeof op !== 'object') continue;
      if (typeof op.summary === 'string') {
        op.summary = stripPasoLabel(op.summary);
      }
      if (typeof op.description === 'string') {
        op.description = op.description.replace(
          /Paso\s*\d+\s*[·.•\-–—:]\s*/gi,
          '',
        );
      }
    }
  }
  return doc;
}
