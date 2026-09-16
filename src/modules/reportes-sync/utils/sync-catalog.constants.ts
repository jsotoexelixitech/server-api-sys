/**
 * Entidades de catálogo Sis2000 → PostgreSQL (upsert, sin DELETE).
 */
export const CATALOG_ENTIDADES = Object.freeze([
  'ramos',
  'canales',
  'productores',
  'anulaciones',
  'rechazos',
] as const);

export type CatalogEntidad = (typeof CATALOG_ENTIDADES)[number];

const CATALOG_SET = new Set<string>(CATALOG_ENTIDADES);

export const CATALOG_TABLES: Readonly<Record<CatalogEntidad, string>> =
  Object.freeze({
    ramos: 'ramos',
    canales: 'canal',
    productores: 'productor',
    anulaciones: 'anulacion',
    rechazos: 'rechazo',
  });

export function isCatalogEntidad(entidad: string): boolean {
  return CATALOG_SET.has(entidad);
}
