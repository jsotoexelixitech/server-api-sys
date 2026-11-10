/**
 * Cobro por días de un plan (configurador / product-builder). Funciones puras: sin BD ni Nest.
 * Días inclusivos como Viajero (personas.service computeProrrataNdias): fhasta - fdesde + 1.
 * Prima por cobertura = prima_diaria × días, redondeada a 2 decimales; prima_total = suma de las coberturas.
 */

export const COBRO_DIAS_MAX = 366;

export interface PrimaDiaria {
  ccober: string;
  prima_diaria: number;
}

export interface ConfigCobroDias {
  activo: boolean;
  dias_min: number;
  dias_max: number;
  primas: PrimaDiaria[];
}

export interface EntradaCotizacion {
  fdesde?: string;
  fhasta?: string;
  dias?: number;
}

export interface CotizacionCobroDias {
  dias: number;
  prima_diaria_total: number;
  prima_total: number;
  coberturas: Array<{ ccober: string; prima_diaria: number; prima: number }>;
}

export type CobroDiasErrorCodigo = 'SIN_CONFIG' | 'INACTIVO' | 'FECHAS' | 'RANGO';

/** Error de negocio; el servicio lo traduce a 404 (SIN_CONFIG) o 400 (el resto). */
export class CobroDiasError extends Error {
  constructor(readonly codigo: CobroDiasErrorCodigo, mensaje: string) {
    super(mensaje);
    this.name = 'CobroDiasError';
  }
}

const redondear = (v: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round((v + Number.EPSILON) * f) / f;
};

/** Redondeo monetario a 2 decimales. */
export const redondear2 = (v: number) => redondear(v, 2);

/** Suma de primas diarias (6 decimales, igual que la precisión aceptada por cobertura). */
export const primaDiariaTotal = (primas: PrimaDiaria[]) => redondear(primas.reduce((s, p) => s + Number(p.prima_diaria || 0), 0), 6);

const fechaUtc = (v: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) return null;
  return t;
};

/** Días inclusivos entre dos fechas YYYY-MM-DD (mismo día = 1). */
export function diasInclusivos(fdesde: string, fhasta: string): number {
  const d = fechaUtc(String(fdesde ?? '').trim());
  const h = fechaUtc(String(fhasta ?? '').trim());
  if (d === null || h === null) throw new CobroDiasError('FECHAS', 'Las fechas deben tener el formato AAAA-MM-DD y ser válidas.');
  if (h < d) throw new CobroDiasError('FECHAS', 'La fecha hasta no puede ser anterior a la fecha desde.');
  return Math.round((h - d) / 86400000) + 1;
}

/** Días de la entrada: fdesde/fhasta tienen prioridad; si no, `dias` entero ≥ 1. */
export function diasDeEntrada(e: EntradaCotizacion): number {
  if (e.fdesde || e.fhasta) {
    if (!e.fdesde || !e.fhasta) throw new CobroDiasError('FECHAS', 'Indique fecha desde y fecha hasta, o la cantidad de días.');
    return diasInclusivos(e.fdesde, e.fhasta);
  }
  if (typeof e.dias === 'number' && Number.isInteger(e.dias) && e.dias >= 1) return e.dias;
  throw new CobroDiasError('FECHAS', 'Indique fecha desde y fecha hasta, o la cantidad de días (entero mayor o igual a 1).');
}

/** Cotiza con la configuración del plan. `config` null = el plan no tiene cobro por días. */
export function cotizarCobroDias(config: ConfigCobroDias | null, entrada: EntradaCotizacion): CotizacionCobroDias {
  if (!config) throw new CobroDiasError('SIN_CONFIG', 'El plan no tiene configurado el cobro por días.');
  if (!config.activo) throw new CobroDiasError('INACTIVO', 'El cobro por días de este plan está inactivo.');
  if (!config.primas?.length) throw new CobroDiasError('INACTIVO', 'El cobro por días de este plan no tiene primas por cobertura.');
  const dias = diasDeEntrada(entrada);
  if (dias < config.dias_min) {
    throw new CobroDiasError('RANGO', `El plan exige al menos ${config.dias_min} día(s); la cotización es de ${dias} día(s).`);
  }
  if (dias > config.dias_max) {
    throw new CobroDiasError('RANGO', `El plan permite como máximo ${config.dias_max} día(s); la cotización es de ${dias} día(s).`);
  }
  const coberturas = config.primas.map((p) => {
    const prima_diaria = Number(p.prima_diaria);
    return { ccober: String(p.ccober).trim(), prima_diaria, prima: redondear2(prima_diaria * dias) };
  });
  return {
    dias,
    prima_diaria_total: primaDiariaTotal(config.primas),
    prima_total: redondear2(coberturas.reduce((s, c) => s + c.prima, 0)),
    coberturas,
  };
}

/** Reglas del PUT que class-validator no cubre (cruce entre campos). Devuelve los errores en español. */
export function validarConfigCobroDias(c: ConfigCobroDias): string[] {
  const errores: string[] = [];
  if (!Number.isInteger(c.dias_min) || c.dias_min < 1) errores.push('dias_min debe ser un entero mayor o igual a 1.');
  if (!Number.isInteger(c.dias_max) || c.dias_max > COBRO_DIAS_MAX) errores.push(`dias_max debe ser un entero menor o igual a ${COBRO_DIAS_MAX}.`);
  if (c.dias_max < c.dias_min) errores.push('dias_max no puede ser menor que dias_min.');
  if (c.activo && !c.primas?.length) errores.push('Para activar el cobro por días indique al menos una cobertura con su prima diaria.');
  const vistos = new Set<string>();
  for (const p of c.primas ?? []) {
    const k = String(p.ccober ?? '').trim();
    if (!k) errores.push('Hay una cobertura sin código.');
    else if (vistos.has(k)) errores.push(`La cobertura ${k} está repetida.`);
    vistos.add(k);
    if (!(Number(p.prima_diaria) > 0)) errores.push(`La prima diaria de la cobertura ${k || '?'} debe ser mayor que 0.`);
  }
  return errores;
}
