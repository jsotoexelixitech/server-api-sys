import type { SqlParam } from './vehicle-policy-search';

/** País de los catálogos de ubicación del módulo de Siniestros (Venezuela). */
export const CPAIS_VENEZUELA = 58;

export interface GeoItem {
  codigo: number;
  nombre: string;
}

const esMarcador = (n: string) => ['TODO', 'TODOS', 'TODAS'].includes(n.trim().toUpperCase());

/** Estados de Venezuela (`maestados`), sin el marcador "Todos". Catálogo: sin datos personales. */
export function buildEstadosQuery(): { sql: string; params: SqlParam[] } {
  return {
    sql: `SELECT cestado AS codigo, RTRIM(xdescripcion_l) AS nombre
          FROM maestados
          WHERE cpais = @cpais AND cestado > 0
          ORDER BY xdescripcion_l`,
    params: [{ name: 'cpais', type: 'int', value: CPAIS_VENEZUELA }],
  };
}

/** Ciudades de un estado (`maciudades`). */
export function buildCiudadesQuery(cestado: number): { sql: string; params: SqlParam[] } {
  if (!Number.isInteger(cestado) || cestado <= 0) throw new RangeError('cestado inválido');
  return {
    sql: `SELECT cciudad AS codigo, RTRIM(xdescripcion_l) AS nombre
          FROM maciudades
          WHERE cpais = @cpais AND cestado = @cestado AND cciudad > 0
          ORDER BY xdescripcion_l`,
    params: [
      { name: 'cpais', type: 'int', value: CPAIS_VENEZUELA },
      { name: 'cestado', type: 'int', value: cestado },
    ],
  };
}

export function limpiarGeo(filas: { codigo: unknown; nombre: unknown }[]): GeoItem[] {
  return filas
    .map((f) => ({ codigo: Number(f.codigo), nombre: String(f.nombre ?? '').trim() }))
    .filter((f) => Number.isInteger(f.codigo) && f.codigo > 0 && f.nombre && !esMarcador(f.nombre));
}
