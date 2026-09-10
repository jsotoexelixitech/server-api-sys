/** Prefijo público HTTPS: `/nest-api-docs` (cierrelmds o nexusqa). Vacío en local. */
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
  /** Ruta absoluta (/nest-api-docs/assets/…); inmune al <base href="/"> de Swagger UI. */
  brandAssetUrl: (relativePath: string) => string;
}

export function resolvePublicApiPaths(options: {
  publicApiPrefix?: string;
  publicApiOrigin?: string;
}): PublicApiPaths {
  const prefix = normalizePublicPrefix(options.publicApiPrefix);
  const origin = String(options.publicApiOrigin ?? 'https://nexusqa.exelixitech.com').replace(
    /\/+$/,
    '',
  );
  const publicBaseUrl = `${origin}${prefix}`;

  const brandAssetUrl = (relativePath: string): string => {
    const clean = relativePath.replace(/^\/+/, '');
    return prefix ? joinPublicPath(prefix, 'assets', clean) : `/assets/${clean}`;
  };

  return {
    prefix,
    origin,
    publicBaseUrl,
    brandAssetUrl,
  };
}
