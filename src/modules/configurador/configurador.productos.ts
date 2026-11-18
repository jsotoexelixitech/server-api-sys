// Productos de Sis2000 (maproductos) para el configurador: solo lectura. Devuelve las mismas columnas que la lista del
// paquete partner (/api/v1/partner/products/list) para que proyecto-product-builder no cambie su forma.

/** Columnas de maproductos que se devuelven (todas las de la tabla). */
export const COLUMNAS_PRODUCTO = [
  'cproducto', 'cramo', 'u_version', 'xdescripcion_l', 'xdescripcion_c', 'xabreviatura', 'iproductor', 'icanal', 'igestor',
  'xform', 'cprog', 'ifuente', 'bok', 'cerror', 'fingreso', 'cusuario', 'ccategoria', 'cusuarioauto', 'ccategoriaauto',
  'fultmod', 'cusuariomod', 'ccategoriamod', 'ctiporamo', 'xdescripcion_prod', 'mmonto_inicial', 'norden',
  'xfraccionamiento', 'xurl_presentacion',
] as const;

export type ProductoSis2000 = {
  cproducto: string;
  cramo: number | null;
  u_version: string | null;
  xdescripcion_l: string;
  xdescripcion_c: string | null;
  xabreviatura: string;
  iproductor: boolean;
  icanal: boolean;
  igestor: boolean;
  xform: string | null;
  cprog: string | null;
  ifuente: string | null;
  bok: string | null;
  cerror: string | null;
  fingreso: string | null;
  cusuario: number | null;
  ccategoria: number | null;
  cusuarioauto: number | null;
  ccategoriaauto: number | null;
  fultmod: string | null;
  cusuariomod: number | null;
  ccategoriamod: number | null;
  ctiporamo: number | null;
  xdescripcion_prod: string | null;
  mmonto_inicial: string | null;
  norden: number | null;
  xfraccionamiento: string | null;
  xurl_presentacion: string | null;
};

const texto = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bit = (v: unknown): boolean => v === true || v === 1 || v === '1' || String(v ?? '').trim().toLowerCase() === 'true';

/** Fecha y hora ISO de un DATETIME de mssql (Date) o el texto tal cual; null si no hay. */
const fechaHora = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return texto(v);
};

/** Fila cruda de maproductos (CHAR con relleno, bits, DATETIME) → producto con textos recortados. */
export function filaProducto(f: Record<string, unknown>): ProductoSis2000 {
  return {
    cproducto: texto(f.cproducto) ?? '',
    cramo: numero(f.cramo),
    u_version: texto(f.u_version),
    xdescripcion_l: texto(f.xdescripcion_l) ?? '',
    xdescripcion_c: texto(f.xdescripcion_c),
    xabreviatura: texto(f.xabreviatura) ?? '',
    iproductor: bit(f.iproductor),
    icanal: bit(f.icanal),
    igestor: bit(f.igestor),
    xform: texto(f.xform),
    cprog: texto(f.cprog),
    ifuente: texto(f.ifuente),
    bok: texto(f.bok),
    cerror: texto(f.cerror),
    fingreso: fechaHora(f.fingreso),
    cusuario: numero(f.cusuario),
    ccategoria: numero(f.ccategoria),
    cusuarioauto: numero(f.cusuarioauto),
    ccategoriaauto: numero(f.ccategoriaauto),
    fultmod: fechaHora(f.fultmod),
    cusuariomod: numero(f.cusuariomod),
    ccategoriamod: numero(f.ccategoriamod),
    ctiporamo: numero(f.ctiporamo),
    xdescripcion_prod: texto(f.xdescripcion_prod),
    mmonto_inicial: texto(f.mmonto_inicial),
    norden: numero(f.norden),
    xfraccionamiento: texto(f.xfraccionamiento),
    xurl_presentacion: texto(f.xurl_presentacion),
  };
}

/** Filtro de la lista: ramo opcional y texto (código, nombre o abreviatura) recortado a 60. */
export function filtroProductos(cramo?: number | null, q?: string | null): { cramo: number | null; q: string } {
  const r = cramo == null || !Number.isFinite(Number(cramo)) || Number(cramo) <= 0 ? null : Math.trunc(Number(cramo));
  return { cramo: r, q: String(q ?? '').trim().slice(0, 60) };
}
