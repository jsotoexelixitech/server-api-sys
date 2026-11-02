/**
 * Lógica pura del flujo "Renovar" (para el cliente es renovación; para Sis2000 es póliza nueva).
 * Sin acceso a BD: elegibilidad, fechas sugeridas, canal para planes y mapeo de filas Sis2000.
 */

export const RCV_CRAMO = 18;
export const DEFAULT_DIAS_ANTES = 30;
export const DEFAULT_DIAS_DESPUES = 30;

export type MotivoElegibilidad =
  | 'ELEGIBLE'
  | 'ANULADA'
  | 'YA_RENOVADA'
  | 'ANTES_DE_VENTANA'
  | 'FUERA_DE_VENTANA'
  | 'SIN_FECHA_HASTA';

export interface ElegibilidadInput {
  /** fhasta de la póliza origen (YYYY-MM-DD). */
  fhasta: string | null;
  /** Hoy (YYYY-MM-DD). */
  hoy: string;
  anulada: boolean;
  /** cnpoliza de la póliza nueva ya enlazada (cnpoliza_rel = origen), si existe. */
  renovadaPor?: string | null;
  diasAntes?: number;
  diasDespues?: number;
}

export interface ElegibilidadResult {
  elegible: boolean;
  motivo: MotivoElegibilidad;
  mensaje: string;
  ventana: { desde: string | null; hasta: string | null; dias_antes: number; dias_despues: number };
  dias_para_vencer: number | null;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** 'YYYY-MM-DD' (o Date) → ms UTC a medianoche; null si no es fecha válida. */
export function isoToUtcMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const m = ISO_RE.exec(String(value).trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIsoDate(value: string | Date | null | undefined): string | null {
  const ms = isoToUtcMs(value);
  return ms == null ? null : new Date(ms).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const ms = isoToUtcMs(iso);
  if (ms == null) return iso;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** Suma años respetando el 29-feb (→ 28-feb en años no bisiestos). */
export function addYearsIso(iso: string, years: number): string {
  const ms = isoToUtcMs(iso);
  if (ms == null) return iso;
  const d = new Date(ms);
  const y = d.getUTCFullYear() + years;
  const month = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return new Date(Date.UTC(y, month, day)).toISOString().slice(0, 10);
}

export function diffDays(fromIso: string, toIso: string): number | null {
  const a = isoToUtcMs(fromIso);
  const b = isoToUtcMs(toIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Lee un entero ≥ 0 de env; si no es válido usa el default. */
export function parseDiasEnv(raw: unknown, fallback: number): number {
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * Elegible si no está anulada, no tiene ya una póliza nueva enlazada y hoy cae en
 * [fhasta - diasAntes, fhasta + diasDespues].
 */
export function evaluarElegibilidad(input: ElegibilidadInput): ElegibilidadResult {
  const diasAntes = input.diasAntes ?? DEFAULT_DIAS_ANTES;
  const diasDespues = input.diasDespues ?? DEFAULT_DIAS_DESPUES;
  const fhasta = toIsoDate(input.fhasta);
  const desde = fhasta ? addDaysIso(fhasta, -diasAntes) : null;
  const hasta = fhasta ? addDaysIso(fhasta, diasDespues) : null;
  const ventana = { desde, hasta, dias_antes: diasAntes, dias_despues: diasDespues };
  const dias_para_vencer = fhasta ? diffDays(input.hoy, fhasta) : null;
  const base = { ventana, dias_para_vencer };

  if (input.anulada) {
    return { ...base, elegible: false, motivo: 'ANULADA', mensaje: 'La póliza está anulada; no se puede renovar.' };
  }
  if (input.renovadaPor) {
    return {
      ...base,
      elegible: false,
      motivo: 'YA_RENOVADA',
      mensaje: `La póliza ya fue renovada con la póliza ${input.renovadaPor}.`,
    };
  }
  if (!fhasta || !desde || !hasta) {
    return { ...base, elegible: false, motivo: 'SIN_FECHA_HASTA', mensaje: 'La póliza no tiene fecha de vencimiento.' };
  }
  const hoyMs = isoToUtcMs(input.hoy) ?? 0;
  if (hoyMs < (isoToUtcMs(desde) ?? 0)) {
    return {
      ...base,
      elegible: false,
      motivo: 'ANTES_DE_VENTANA',
      mensaje: `Aún no se puede renovar: disponible desde el ${desde} (vence el ${fhasta}).`,
    };
  }
  if (hoyMs > (isoToUtcMs(hasta) ?? 0)) {
    return {
      ...base,
      elegible: false,
      motivo: 'FUERA_DE_VENTANA',
      mensaje: `La póliza venció el ${fhasta} y pasaron más de ${diasDespues} días; debe emitirse como póliza nueva.`,
    };
  }
  return { ...base, elegible: true, motivo: 'ELEGIBLE', mensaje: 'La póliza puede renovarse.' };
}

/**
 * fdesde de la póliza nueva: fhasta anterior (continuidad) o hoy si ya venció.
 * fhasta sugerida: +1 año si la origen era anual; si no, misma duración en días.
 */
export function sugerirVigencia(
  fdesdeOrigen: string | null,
  fhastaOrigen: string | null,
  hoy: string,
): { fdesde_sugerida: string; fhasta_sugerida: string; continuidad: boolean } {
  const fhasta = toIsoDate(fhastaOrigen);
  const continuidad = Boolean(fhasta && (isoToUtcMs(hoy) ?? 0) <= (isoToUtcMs(fhasta) ?? 0));
  const fdesde = continuidad && fhasta ? fhasta : hoy;
  const duracion = fdesdeOrigen && fhasta ? diffDays(fdesdeOrigen, fhasta) : null;
  const anual = duracion == null || (duracion >= 360 && duracion <= 370);
  const fhastaSug = anual ? addYearsIso(fdesde, 1) : addDaysIso(fdesde, duracion as number);
  return { fdesde_sugerida: fdesde, fhasta_sugerida: fhastaSug, continuidad };
}

export interface CanalPlanes {
  centidad: string;
  citem: string;
  origen: 'query' | 'canal_alterno' | 'productor' | 'default';
}

/** Canal para consultar planes de hoy: query > canal alterno de la póliza (C) > productor (P). */
export function resolverCanal(
  row: { ccanalalt?: unknown; cproductor?: unknown },
  override: { centidad?: string; citem?: string } = {},
  productorDefault = '80080',
): CanalPlanes {
  const oEnt = String(override.centidad ?? '').trim().toUpperCase();
  const oItem = String(override.citem ?? '').trim();
  if (oEnt && oItem) return { centidad: oEnt, citem: oItem, origen: 'query' };

  const canal = Number(String(row.ccanalalt ?? '').trim());
  if (Number.isFinite(canal) && canal > 0) {
    return { centidad: 'C', citem: String(canal), origen: 'canal_alterno' };
  }
  const productor = Number(String(row.cproductor ?? '').trim());
  if (Number.isFinite(productor) && productor > 0) {
    return { centidad: 'P', citem: String(productor), origen: 'productor' };
  }
  return { centidad: 'P', citem: productorDefault, origen: 'default' };
}

export function esRcv(cramo: unknown): boolean {
  return Number(cramo) === RCV_CRAMO;
}

/** Texto recortado o null. */
export function txt(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function num(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Primer valor no vacío entre varias columnas posibles (los esquemas Sis2000 varían por tabla). */
export function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return null;
}

const FRECUENCIAS: Record<string, string> = {
  A: 'Anual',
  S: 'Semestral',
  T: 'Trimestral',
  M: 'Mensual',
  C: 'Cuatrimestral',
  E: 'Única',
};

export function describirFrecuencia(code: unknown): string | null {
  const c = txt(code)?.toUpperCase().charAt(0);
  return c ? FRECUENCIAS[c] ?? c : null;
}

export function esAnulada(row: { istatpol?: unknown }): boolean {
  return txt(row.istatpol)?.toUpperCase() === 'A';
}

export function describirEstado(row: { istatpol?: unknown; iestado?: unknown }, fhasta: string | null, hoy: string): string {
  if (esAnulada(row)) return 'ANULADA';
  if (fhasta && (isoToUtcMs(fhasta) ?? 0) < (isoToUtcMs(hoy) ?? 0)) return 'VENCIDA';
  if (txt(row.iestado)?.toUpperCase() === 'N') return 'NO_VIGENTE';
  return 'VIGENTE';
}

export interface PersonaRenovacion {
  cci_rif: string | null;
  icedula: string | null;
  cid: string | null;
  xnombre: string | null;
  xapellido: string | null;
  xcliente: string | null;
  isexo: string | null;
  iestado_civil: string | null;
  fnacimiento: string | null;
  xtelefono: string | null;
  xcorreo: string | null;
  cestado: string | null;
  cciudad: string | null;
  xdireccion: string | null;
}

/** maclient (+ tel/correo/dir) → bloque persona del formulario. */
export function mapPersona(row: Record<string, unknown> | null | undefined): PersonaRenovacion | null {
  if (!row) return null;
  const cid = txt(pick(row, 'cid'));
  const letra = cid && /^[VEJGPC]/i.test(cid) ? cid.charAt(0).toUpperCase() : null;
  return {
    cci_rif: txt(pick(row, 'cci_rif')),
    icedula: txt(pick(row, 'icedula', 'iclient')) ?? letra,
    cid,
    xnombre: txt(pick(row, 'xnombre')),
    xapellido: txt(pick(row, 'xapellido')),
    xcliente: txt(pick(row, 'xcliente')),
    isexo: txt(pick(row, 'isexo', 'csexo')),
    iestado_civil: txt(pick(row, 'iestado_civil', 'cestado_civil')),
    fnacimiento: toIsoDate(pick(row, 'fnac_iso', 'fnacimiento') as string | null),
    xtelefono: txt(pick(row, 'xtelefono_ren', 'xtelefono')),
    xcorreo: txt(pick(row, 'xcorreo_ren', 'xcorreo')),
    cestado: txt(pick(row, 'cestado_ren', 'cestado')),
    cciudad: txt(pick(row, 'cciudad_ren', 'cciudad')),
    xdireccion: txt(pick(row, 'xdireccion_ren', 'xavecalle', 'xdireccion')),
  };
}

/** peasegurados (+ maclient + maparent) → asegurado. */
export function mapAsegurado(row: Record<string, unknown>) {
  return {
    cci_rif: txt(pick(row, 'casegurado', 'cci_rif')),
    cid: txt(pick(row, 'cid_cli', 'cid')),
    xnombre: txt(pick(row, 'xnombre_cli', 'xnombre')),
    xapellido: txt(pick(row, 'xapellido_cli', 'xapellido')),
    xcliente: txt(pick(row, 'xcliente_cli', 'xcliente')),
    cparentesco: txt(pick(row, 'cparentesco')),
    xparentesco: txt(pick(row, 'xparentesco_ren', 'xparentesco')),
    isexo: txt(pick(row, 'csexo', 'isexo', 'isexo_cli')),
    iestado_civil: txt(pick(row, 'cestado_civil', 'iestado_civil', 'iestado_civil_cli')),
    fnacimiento: toIsoDate(pick(row, 'fnac_iso', 'fnacimiento') as string | null),
  };
}

/** pebenefi → beneficiario (columnas tolerantes; iclaseaseg B = beneficiario). */
export function mapBeneficiario(row: Record<string, unknown>) {
  return {
    cci_rif: txt(pick(row, 'cbeneficiario', 'cci_rif', 'casegurado', 'cbenefi')),
    cid: txt(pick(row, 'cid_cli', 'cid')),
    xnombre: txt(pick(row, 'xnombre_cli', 'xnombre')),
    xapellido: txt(pick(row, 'xapellido_cli', 'xapellido')),
    cparentesco: txt(pick(row, 'cparentesco')),
    pporcentaje: num(pick(row, 'pporce', 'pporcen', 'pporcentaje', 'pparticipa')),
    iclaseaseg: txt(pick(row, 'iclaseaseg')),
  };
}

/** vhcerti (+ mavinma) → vehículo del formulario RCV. */
export function mapVehiculo(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  return {
    xplaca: txt(pick(row, 'xplaca')),
    cmarca: txt(pick(row, 'cmarca')),
    xmarca: txt(pick(row, 'xmarca_ren', 'xmarca')),
    cmodelo: txt(pick(row, 'cmodelo')),
    xmodelo: txt(pick(row, 'xmodelo_ren', 'xmodelo')),
    cversion: txt(pick(row, 'cversion')),
    xversion: txt(pick(row, 'xversion_ren', 'xversion')),
    cano: num(pick(row, 'cano', 'qano')),
    cuso: txt(pick(row, 'cuso', 'ccategovh')),
    xcolor: txt(pick(row, 'xcolor')),
    xsercar: txt(pick(row, 'xsercar')),
    xsermot: txt(pick(row, 'xsermot')),
    qpuestos: num(pick(row, 'qpuestos')),
    mvalor: num(pick(row, 'mvalor')),
  };
}

/** Fila de planes (spBuscaPlan / sp_busca_plan_producto_nexus) → resumen. */
export function mapPlanDisponible(row: Record<string, unknown>) {
  return {
    cramo: num(pick(row, 'cramo')),
    cplan: txt(pick(row, 'cplan')),
    xplan: txt(pick(row, 'xplan', 'xdescripcion_l')),
    cproducto: txt(pick(row, 'cproducto')),
    cmoneda: txt(pick(row, 'cmoneda')),
  };
}

/** Si los asegurados traen periodo, deja solo los del periodo de la póliza origen. */
export function filtrarPorPeriodo<T extends Record<string, unknown>>(
  rows: T[],
  fanopol: unknown,
  fmespol: unknown,
): T[] {
  const conPeriodo = rows.filter((r) => r['fanopol'] != null && r['fmespol'] != null);
  if (!conPeriodo.length) return rows;
  const mismo = conPeriodo.filter(
    (r) => Number(r['fanopol']) === Number(fanopol) && Number(r['fmespol']) === Number(fmespol),
  );
  return mismo.length ? mismo : rows;
}

/**
 * cpoliza es NUMERIC(19) (ej. 1600000000000189330) y no cabe en un number de JS (pierde precisión).
 * Se lee como texto (cpoliza_txt) y se manda a SQL como VARCHAR → CAST(... AS NUMERIC(19,0)).
 */
export function cpolizaTxt(row: Record<string, unknown>): string | null {
  return txt(row['cpoliza_txt']) ?? txt(row['cpoliza']);
}
