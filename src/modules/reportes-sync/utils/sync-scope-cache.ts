/**
 * Vigencia del último sync por ALCANCE (los filtros que el usuario eligió), no por entidad.
 *
 * Con el sync al consultar activo, el TTL por entidad hacía que la consulta de un rango se saltara el
 * refresco solo porque otro usuario (o el refresco programado) había sincronizado OTRO rango hacía menos de
 * 2 minutos. Aquí la vigencia es de cada combinación de filtros.
 *
 * Es memoria del proceso: sirve con una sola instancia de la API (PM2 en modo fork, como hoy).
 */

/** Filtros que no cambian qué filas se extraen del origen (presentación y paginación). */
const CLAVES_IGNORADAS = new Set([
  'pagina',
  'tamano',
  'paginacion',
  'orden',
  'order',
  'sort',
  'bexportar',
  'bpreview',
  'grilla',
  'kpis',
  'graficos',
  'forcesync',
  'refreshscope',
]);

function normalizar(valor: unknown): unknown {
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? valor.toISOString().slice(0, 10) : null;
  if (typeof valor === 'string') return valor.trim().toLowerCase();
  if (Array.isArray(valor)) return valor.map(normalizar);
  return valor;
}

/** Clave estable del alcance: entidad + filtros relevantes ordenados, sin vacíos. */
export function buildScopeKey(entidad: string, filtros: Record<string, unknown> = {}): string {
  const partes: Array<[string, unknown]> = [];
  for (const [clave, valor] of Object.entries(filtros)) {
    if (CLAVES_IGNORADAS.has(clave.toLowerCase())) continue;
    if (valor === null || valor === undefined || valor === '') continue;
    if (typeof valor === 'object' && !(valor instanceof Date) && !Array.isArray(valor)) continue;
    const normalizado = normalizar(valor);
    if (normalizado === '' || normalizado === null) continue;
    partes.push([clave.toLowerCase(), normalizado]);
  }
  partes.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return `${entidad}|${JSON.stringify(partes)}`;
}

export class SyncScopeCache {
  private readonly entradas = new Map<string, number>();

  constructor(private readonly maxEntradas = 500) {}

  /** true si el alcance se sincronizó hace menos de ttlMs. Con ttlMs <= 0 nunca está vigente. */
  isFresh(clave: string, ttlMs: number, ahora: number = Date.now()): boolean {
    if (ttlMs <= 0) return false;
    const ultimo = this.entradas.get(clave);
    return ultimo !== undefined && ahora - ultimo < ttlMs;
  }

  /** Milisegundos desde el último sync del alcance (null si no hay registro). */
  ageMs(clave: string, ahora: number = Date.now()): number | null {
    const ultimo = this.entradas.get(clave);
    return ultimo === undefined ? null : ahora - ultimo;
  }

  mark(clave: string, ahora: number = Date.now()): void {
    this.entradas.delete(clave); // reinsertar = más reciente
    this.entradas.set(clave, ahora);
    while (this.entradas.size > this.maxEntradas) {
      const masAntigua = this.entradas.keys().next().value as string | undefined;
      if (masAntigua === undefined) break;
      this.entradas.delete(masAntigua);
    }
  }

  get size(): number {
    return this.entradas.size;
  }
}
