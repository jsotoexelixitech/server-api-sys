/** Scopes otorgables a API keys nest-api. Wildcard: `emissions:*`, `*`. */
export const NEST_AUTH_SCOPES = {
  EMISSIONS_AUTO: 'emissions:auto',
  EMISSIONS_PERSON: 'emissions:person',
  EMISSIONS_CONDOMINIO: 'emissions:condominio',
  COLLECTION_WRITE: 'collection:write',
  DOCUMENTS_WRITE: 'documents:write',
  ADMIN_KEYS: 'admin:keys',
  PRODUCT_EMISSION_WRITE: 'product-emission:write',
  CLIENT_READ: 'client:read',
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
    routes: [],
  },
  {
    id: NEST_AUTH_SCOPES.EMISSIONS_PERSON,
    label: 'Emisión personas / viajero',
    description: 'Emitir pólizas de personas',
    routes: [],
  },
  {
    id: NEST_AUTH_SCOPES.EMISSIONS_CONDOMINIO,
    label: 'Emisión condominio',
    description: 'Emitir pólizas de condominio',
    routes: ['POST /api/v1/condominio/emision'],
  },
  {
    id: NEST_AUTH_SCOPES.COLLECTION_WRITE,
    label: 'Cobranza',
    description: 'Notificar, cobrar y activar recibos',
    routes: [],
  },
  {
    id: NEST_AUTH_SCOPES.DOCUMENTS_WRITE,
    label: 'Documentos',
    description: 'Generar conductor habitual',
    routes: [],
  },
  {
    id: NEST_AUTH_SCOPES.ADMIN_KEYS,
    label: 'Administrar keys',
    description: 'Panel y API de gestión de API keys',
    routes: [],
  },
  {
    id: NEST_AUTH_SCOPES.PRODUCT_EMISSION_WRITE,
    label: 'Emisión genérica (product-builder)',
    description: 'Cotizar/validar/emitir pólizas de ramos creados en proyecto-product-builder',
    routes: [],
  },
  {
    id: NEST_AUTH_SCOPES.CLIENT_READ,
    label: 'Consulta de clientes',
    description: 'Datos del cliente, pólizas del asegurado y coberturas',
    routes: [
      'GET /api/v1/client/search/{cci_rif}',
      'GET /api/v1/client/search/policies/{cci_rif}',
      'POST /api/v1/client/search/coverages',
    ],
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

export function normalizeHttpPath(path: string): string {
  const cleaned = String(path ?? '')
    .split('?')[0]
    .replace(/\/{2,}/g, '/');
  if (!cleaned) return '/';
  return cleaned.length > 1 && cleaned.endsWith('/')
    ? cleaned.slice(0, -1)
    : cleaned;
}

/** Línea canónica: `POST /api/v1/...` */
export function toRouteGrantLine(method: string, path: string): string {
  return `${String(method).toUpperCase()} ${normalizeHttpPath(path)}`;
}

/** Scope completo (legacy) o grant por ruta individual en `granted`. */
export function grantMatchesRoute(
  granted: string[],
  method: string,
  path: string,
  requiredScope?: string,
): boolean {
  if (!requiredScope) return true;
  if (!granted?.length) return false;
  if (scopeMatches(granted, requiredScope)) return true;

  const routeLine = toRouteGrantLine(method, path);
  for (const grant of granted) {
    const normalized = String(grant ?? '').trim();
    if (!normalized.includes(' ')) continue;
    const space = normalized.indexOf(' ');
    const grantMethod = normalized.slice(0, space).toUpperCase();
    const grantPath = normalizeHttpPath(normalized.slice(space + 1));
    if (`${grantMethod} ${grantPath}` === routeLine) return true;
  }
  return false;
}
