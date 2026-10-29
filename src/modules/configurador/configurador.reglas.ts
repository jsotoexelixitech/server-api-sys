// Reglas del configurador que no dependen de la BD: se validan antes de escribir en Sis2000.

export interface TramoEdad { nedad_min: number; nedad_max: number; pprima: number; mprima?: number }

/** Tramos de una tabla de tasas por edad: edad mínima ≤ máxima, sin solaparse y con tasa o prima. */
export function validarTramos(tramos: TramoEdad[]): string[] {
  const errores: string[] = [];
  const orden = [...tramos].sort((a, b) => a.nedad_min - b.nedad_min);
  orden.forEach((t, i) => {
    const n = `Tramo ${t.nedad_min}-${t.nedad_max}`;
    if (t.nedad_min > t.nedad_max) errores.push(`${n}: la edad mínima es mayor que la máxima.`);
    if (!(t.pprima > 0) && !((t.mprima ?? 0) > 0)) errores.push(`${n}: necesita tasa (pprima) o prima (mprima) mayor a 0.`);
    const previo = orden[i - 1];
    if (previo && t.nedad_min <= previo.nedad_max) errores.push(`${n}: se solapa con el tramo ${previo.nedad_min}-${previo.nedad_max}.`);
  });
  return errores;
}

interface ParentescoRegla { cparen: number; csexo: string; nedad_min: number; nedad_max: number }
interface CoberturaRegla {
  ccobertura: string; ctarifa: string;
  msumamin?: number; msumamax?: number; mprima?: number; pprima?: number;
  parentescos?: ParentescoRegla[];
}
export interface PlanRegla {
  type: 'cosas' | 'personas';
  fdesde: string; fhasta: string;
  all_productor?: boolean; productores?: number[];
  coberturas: CoberturaRegla[];
  frecuencias: { ifrecuencia: string }[];
}

/** Un plan que se pueda cotizar: en cosas suma y prima o tasa; en personas parentescos con edades. */
export function validarPlan(plan: PlanRegla): string[] {
  const errores: string[] = [];
  if (plan.fdesde > plan.fhasta) errores.push('fdesde es posterior a fhasta.');
  if (!plan.all_productor && !(plan.productores?.length)) {
    errores.push('Indica los productores que pueden vender el plan o all_productor: true.');
  }

  const frecuencias = plan.frecuencias.map((f) => f.ifrecuencia.trim().toUpperCase());
  if (new Set(frecuencias).size !== frecuencias.length) errores.push('Hay frecuencias repetidas.');

  const coberturas = plan.coberturas.map((c) => c.ccobertura.trim());
  if (new Set(coberturas).size !== coberturas.length) errores.push('Hay coberturas repetidas.');

  for (const c of plan.coberturas) {
    const n = `Cobertura ${c.ccobertura.trim()}`;
    if (plan.type === 'cosas') {
      if (!((c.msumamax ?? 0) > 0)) errores.push(`${n}: msumamax debe ser mayor a 0.`);
      if ((c.msumamin ?? 0) > (c.msumamax ?? 0)) errores.push(`${n}: msumamin es mayor que msumamax.`);
      if (!((c.mprima ?? 0) > 0) && !((c.pprima ?? 0) > 0)) errores.push(`${n}: necesita prima (mprima) o tasa (pprima).`);
      continue;
    }
    const parentescos = c.parentescos ?? [];
    if (!parentescos.length) errores.push(`${n}: agrega al menos un parentesco.`);
    const claves = parentescos.map((p) => `${p.cparen}-${p.csexo}`);
    if (new Set(claves).size !== claves.length) errores.push(`${n}: hay parentescos repetidos con el mismo sexo.`);
    for (const p of parentescos) {
      if (p.nedad_min > p.nedad_max) errores.push(`${n}, parentesco ${p.cparen}: la edad mínima es mayor que la máxima.`);
    }
  }
  return errores;
}
