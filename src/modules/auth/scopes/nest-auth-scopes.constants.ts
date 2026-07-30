/** Scopes otorgables a API keys nest-api. Wildcard: `emissions:*`, `*`. */
export const NEST_AUTH_SCOPES = {
  EMISSIONS_AUTO: 'emissions:auto',
  EMISSIONS_PERSON: 'emissions:person',
  COLLECTION_WRITE: 'collection:write',
  DOCUMENTS_WRITE: 'documents:write',
  ADMIN_KEYS: 'admin:keys',
} as const;

export type NestAuthScopeId =
  (typeof NEST_AUTH_SCOPES)[keyof typeof NEST_AUTH_SCOPES];

export interface NestAuthScopeMeta {
  id: NestAuthScopeId | string;
  label: string;
  description: string;
  routes: string[];
}

export const NEST_AUTH_SCOPE_CATALOG: NestAuthScopeMeta[] = [
  {
    id: NEST_AUTH_SCOPES.EMISSIONS_AUTO,
    label: 'Emisión automóvil',
    description: 'Emitir pólizas RCV / auto',
    routes: ['POST /api/v1/external/createEmissionAuto'],
  },
  {
    id: NEST_AUTH_SCOPES.EMISSIONS_PERSON,
    label: 'Emisión personas / viajero',
    description: 'Emitir pólizas de personas',
    routes: [
      'POST /api/v1/personas/emision',
      'POST /api/v1/external/createEmissionPerson',
    ],
  },
  {
    id: NEST_AUTH_SCOPES.COLLECTION_WRITE,
    label: 'Cobranza',
    description: 'Notificar, cobrar y activar recibos',
    routes: [
      'POST /api/v1/external/collection/notific',
      'POST /api/v1/external/collection/collect',
      'POST /api/v1/external/collection/activate',
    ],
  },
  {
    id: NEST_AUTH_SCOPES.DOCUMENTS_WRITE,
    label: 'Documentos',
    description: 'Generar conductor habitual',
    routes: ['POST /api/v1/documents/conductor-habitual'],
  },
  {
    id: NEST_AUTH_SCOPES.ADMIN_KEYS,
    label: 'Administrar keys',
    description: 'Panel y API de gestión de API keys',
    routes: ['GET/POST/PATCH /api/v1/admin/keys'],
  },
];

export function scopeMatches(
  granted: string[],
  required: string | undefined,
): boolean {
  if (!required) return true;
  if (!granted?.length) return false;
  if (granted.includes('*')) return true;

  const [reqNs, reqAct] = required.split(':');
  for (const g of granted) {
    if (g === required) return true;
    const [gNs, gAct] = g.split(':');
    if (gNs === reqNs && (gAct === '*' || gAct === reqAct)) return true;
    if (gNs === '*' || g === `${reqNs}:*`) return true;
  }
  return false;
}
