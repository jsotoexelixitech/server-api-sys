// Reglas puras de las edades por parentesco del plan de personas (mapledades_per). Sin BD.
//
// PK de mapledades_per: (cramo, cplan, fdesde_plan, cparen): una fila por parentesco y versión del plan.
// sp_calculo_per_nexus toma cemin_ase/cemax_ase del parentesco y rechaza al asegurado fuera de ese rango.
// spMantPlanes la inserta dentro del bucle de coberturas (una vez por cobertura): con dos coberturas choca con la PK;
// por eso las edades se editan aquí, una fila por parentesco.

export interface EdadesEntrada {
  cemin_ase?: number | null;
  cemax_ase?: number | null;
  cemin_gi?: number | null;
  cemax_gi?: number | null;
  msvitalicia?: number | null;
  msvitaliciaext?: number | null;
  cereduccion?: number | null;
  msreducida?: number | null;
  msreducidaext?: number | null;
}

const EDADES = ['cemin_ase', 'cemax_ase', 'cemin_gi', 'cemax_gi', 'cereduccion'] as const;
const MONTOS = ['msvitalicia', 'msvitaliciaext', 'msreducida', 'msreducidaext'] as const;

const edadValida = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 255;

/** Errores: edades del asegurado obligatorias; edades enteras 0-255 (TINYINT); mín ≤ máx; montos ≥ 0. */
export function validarEdades(dto: EdadesEntrada): string[] {
  const errores: string[] = [];
  if (dto.cemin_ase == null || dto.cemax_ase == null) errores.push('cemin_ase y cemax_ase son obligatorias.');
  for (const k of EDADES) if (dto[k] != null && !edadValida(dto[k])) errores.push(`${k} debe ser un entero entre 0 y 255.`);
  for (const k of MONTOS) if (dto[k] != null && !(typeof dto[k] === 'number' && (dto[k] as number) >= 0)) errores.push(`${k} debe ser mayor o igual a 0.`);
  if (dto.cemin_ase != null && dto.cemax_ase != null && dto.cemin_ase > dto.cemax_ase) errores.push('cemin_ase no puede ser mayor que cemax_ase.');
  if (dto.cemin_gi != null && dto.cemax_gi != null && dto.cemin_gi > dto.cemax_gi) errores.push('cemin_gi no puede ser mayor que cemax_gi.');
  return errores;
}

/**
 * Valores del alta (fila nueva): lo enviado y, si falta, lo mismo que pondría spMantPlanes — edades de grupo igual
 * a las del asegurado, cereduccion = edad máxima y montos en 0.
 */
export function valoresAltaEdades(dto: EdadesEntrada) {
  const max = dto.cemax_ase as number;
  return {
    cemin_ase: dto.cemin_ase as number,
    cemax_ase: max,
    cemin_gi: dto.cemin_gi ?? (dto.cemin_ase as number),
    cemax_gi: dto.cemax_gi ?? max,
    msvitalicia: dto.msvitalicia ?? 0,
    msvitaliciaext: dto.msvitaliciaext ?? 0,
    cereduccion: dto.cereduccion ?? max,
    msreducida: dto.msreducida ?? 0,
    msreducidaext: dto.msreducidaext ?? 0,
  };
}

export interface TramoEdad {
  nedad_min: number;
  nedad_max: number | null;
}

/** Rangos [desde, hasta] de edades enteras entre min y max que ningún tramo cubre. nedad_max NULL = solo nedad_min. */
export function huecosEdad(tramos: TramoEdad[], min: number, max: number): Array<{ desde: number; hasta: number }> {
  const orden = tramos
    .map((t) => ({ a: Number(t.nedad_min), b: t.nedad_max == null ? Number(t.nedad_min) : Number(t.nedad_max) }))
    .filter((t) => Number.isFinite(t.a) && Number.isFinite(t.b) && t.b >= t.a)
    .sort((x, y) => x.a - y.a);
  const huecos: Array<{ desde: number; hasta: number }> = [];
  let siguiente = min;
  for (const t of orden) {
    if (siguiente > max) break;
    if (t.b < siguiente) continue;
    if (t.a > siguiente) huecos.push({ desde: siguiente, hasta: Math.min(t.a - 1, max) });
    siguiente = Math.max(siguiente, t.b + 1);
  }
  if (siguiente <= max) huecos.push({ desde: siguiente, hasta: max });
  return huecos;
}

/**
 * Avisos (no bloquean) si alguna tabla de tasas del parentesco no cubre todo el rango de edades asegurables:
 * sp_calculo_per_nexus une por edad con mapltabedad_d y sin tramo esa cobertura no se cotiza.
 */
export function avisosCoberturaEdades(tablas: Record<string, TramoEdad[]>, cparen: number, min: number, max: number): string[] {
  const avisos: string[] = [];
  const nombres = Object.keys(tablas);
  if (!nombres.length) {
    avisos.push(`El parentesco ${cparen} no tiene tarifas en el plan (mapltarifas_per): la edad no se usará hasta agregarle coberturas.`);
    return avisos;
  }
  for (const t of nombres) {
    const h = huecosEdad(tablas[t], min, max);
    if (h.length) {
      const txt = h.map((x) => (x.desde === x.hasta ? `${x.desde}` : `${x.desde}-${x.hasta}`)).join(', ');
      avisos.push(`La tabla de tasas ${t} (parentesco ${cparen}) no cubre las edades ${txt}: en esas edades la cobertura no se cotiza.`);
    }
  }
  return avisos;
}
