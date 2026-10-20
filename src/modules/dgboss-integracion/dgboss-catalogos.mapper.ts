import type { CodigoDescripcion, DgbossCatalogos } from './dgboss.types';

type Row = Record<string, unknown>;

const s = (v: unknown) => String(v ?? '').trim();

/** Normaliza filas {codigo, descripcion}, descarta códigos vacíos y duplicados. */
export function toCodigoDescripcion(rows: Row[]): CodigoDescripcion[] {
  const seen = new Set<string>();
  const out: CodigoDescripcion[] = [];
  for (const r of rows) {
    const codigo = s(r['codigo']);
    if (!codigo || seen.has(codigo)) continue;
    seen.add(codigo);
    out.push({ codigo, descripcion: s(r['descripcion']) || codigo });
  }
  return out;
}

/** Tipos de recibo de adrecibos.itiporec. */
export const TIPO_RECIBO_BASE: CodigoDescripcion[] = [
  { codigo: 'P', descripcion: 'Pendiente' },
  { codigo: 'A', descripcion: 'Anulado' },
  { codigo: 'D', descripcion: 'Devuelto' },
];

/** Homologa la moneda de Sis2000 al código del catálogo: USD y $ se envían como $. */
export function normalizeMoneda(raw: unknown): string {
  const m = s(raw).toUpperCase();
  return m === 'USD' ? '$' : s(raw);
}

export function buildCatalogos(
  aseguradoraRif: string,
  data: {
    lineas: Row[];
    ramos: Row[];
    coberturas: Row[];
    moneda: Row[];
    producto: Row[];
    frecuencia: Row[];
  },
): DgbossCatalogos {
  const lineas = toCodigoDescripcion(data.lineas);
  const lineaCodes = new Set(lineas.map((l) => l.codigo));
  // codigo_linea debe existir en lineas_negocio del mismo body.
  const ramos = toCodigoDescripcion(data.ramos)
    .map((r) => {
      const src = data.ramos.find((x) => s(x['codigo']) === r.codigo);
      return { ...r, codigo_linea: s(src?.['codigo_linea']) };
    })
    .filter((r) => lineaCodes.has(r.codigo_linea));

  return {
    aseguradora_rif: aseguradoraRif,
    lineas_negocio: lineas,
    ramos,
    coberturas: toCodigoDescripcion(data.coberturas),
    // Productos de personas: sin vehículo ni patrimoniales.
    marcas: [],
    modelos: [],
    tipo_vehiculo: [],
    moneda: toCodigoDescripcion(data.moneda),
    producto: toCodigoDescripcion(data.producto),
    indole: [],
    frecuencia_pago: toCodigoDescripcion(data.frecuencia),
    tipo_recibo: TIPO_RECIBO_BASE,
  };
}
