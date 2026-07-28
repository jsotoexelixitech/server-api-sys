/** Prefijo público HTTPS (cierrelmds): `/api-docs-nest-api`, `/pagos-api`, etc. Vacío en local. */
export function normalizePublicPrefix(raw: string | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed === '/') return '';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '');
}

export function joinPublicPath(prefix: string, ...segments: string[]): string {
  const parts = [prefix, ...segments.map((s) => s.replace(/^\/+|\/+$/g, ''))].filter(Boolean);
  return parts.join('/');
}

export function stripLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '');
}

export interface PublicApiPaths {
  prefix: string;
  origin: string;
  publicBaseUrl: string;
  /** URL relativa o absoluta para assets de Swagger (funciona con Apache strip). */
  brandAssetUrl: (relativePath: string) => string;
}

export function resolvePublicApiPaths(options: {
  publicApiPrefix?: string;
  publicApiOrigin?: string;
}): PublicApiPaths {
  const prefix = normalizePublicPrefix(options.publicApiPrefix);
  const origin = String(options.publicApiOrigin ?? 'https://cierrelmds.exelixitech.com').replace(
    /\/+$/,
    '',
  );
  const publicBaseUrl = `${origin}${prefix}`;

  const brandAssetUrl = (relativePath: string): string => {
    const clean = relativePath.replace(/^\/+/, '');
    if (!prefix) return `/assets/${clean}`;
    return joinPublicPath(prefix, 'assets', clean);
  };

  return {
    prefix,
    origin,
    publicBaseUrl,
    brandAssetUrl,
  };
}
