// Lectura completa de un plan de Sis2000 para respaldo y restauración desde el configurador (product-builder).
// Devuelve las filas tal como están en las tablas y, además, el plan en la forma de PlanDto para poder
// reescribirlo por spMantPlanes. No inventa valores: lo que no está en las filas se informa en `advertencias`.

type Fila = Record<string, unknown>;

/** Filas del plan en las tablas que llena spMantPlanes. */
export interface FilasPlan {
  maplanes: Fila[];
  maplanes_per: Fila[];
  maplantar: Fila[];
  maplcober_per: Fila[];
  mapltarifas_per: Fila[];
  mapledades_per: Fila[];
  maplanes_frec: Fila[];
  mausuplan: Fila[];
}

export interface PlanLeido {
  type: 'cosas' | 'personas';
  /** Forma de PlanDto (v1/configurador/planes). */
  plan: Record<string, unknown>;
  /** Datos que no se pudieron reconstruir o que spMantPlanes no recibe (no se reponen al restaurar). */
  advertencias: string[];
  filas: FilasPlan;
}

const txt = (v: unknown): string | undefined => (v == null ? undefined : String(v).trim());

const numero = (v: unknown): number | undefined => {
  if (v == null || v === '' || typeof v === 'boolean') return undefined;
  const n = Number(typeof v === 'string' ? v.trim() : v);
  return Number.isFinite(n) ? n : undefined;
};

const booleano = (v: unknown): boolean | undefined => {
  if (v == null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toUpperCase();
  if (['1', 'T', 'S', 'TRUE', 'Y'].includes(s)) return true;
  if (['0', 'F', 'N', 'FALSE'].includes(s)) return false;
  return undefined;
};

/** Date de mssql (UTC) o texto → 'YYYY-MM-DD'. */
const fechaIso = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
};

const tiene = (filas: Fila[], col: string) => filas.some((f) => Object.prototype.hasOwnProperty.call(f, col));

/** Quita claves undefined o texto vacío (como el mapper del configurador). */
function limpio<T extends Fila>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;
}

/** mausuplan (itipouso A) → all_productor/productores y all_canal/canales. P = productor (maproduc), C = canal alterno (macanalalt). */
function usuariosDelPlan(filas: Fila[], adv: string[]) {
  const tipo = (f: Fila) => (txt(f.itipouso) ?? '').toUpperCase();
  const entidad = (f: Fila) => (txt(f.centidad) ?? '').toUpperCase();
  const permitidos = filas.filter((f) => tipo(f) === 'A');
  const de = (e: string) => permitidos.filter((f) => entidad(f) === e);
  const codigos = (rs: Fila[], nombre: string) => {
    const out: number[] = [];
    for (const f of rs) {
      const citem = txt(f.citem);
      if (!citem) continue;
      const n = numero(citem);
      if (n === undefined || !Number.isInteger(n)) adv.push(`mausuplan: ${nombre} «${citem}» no es un código numérico; no se repone.`);
      else if (!out.includes(n)) out.push(n);
    }
    return out;
  };

  const productores = de('P');
  const canales = de('C');
  const allProductor = productores.some((f) => !txt(f.citem));
  const allCanal = canales.some((f) => !txt(f.citem));

  const exclusiones = filas.filter((f) => tipo(f) === 'E').length;
  if (exclusiones) adv.push(`mausuplan tiene ${exclusiones} exclusión(es) (itipouso E) que spMantPlanes no recibe: no se reponen al restaurar.`);
  const otras = permitidos.filter((f) => !['P', 'C'].includes(entidad(f))).length;
  if (otras) adv.push(`mausuplan tiene ${otras} fila(s) de otras entidades (p. ej. gestores G) que spMantPlanes no recibe: no se reponen al restaurar.`);

  return {
    all_productor: allProductor,
    productores: allProductor ? [] : codigos(productores, 'productor'),
    all_canal: allCanal,
    canales: allCanal ? [] : codigos(canales, 'canal'),
  };
}

/** Cosas: una cobertura por fila de maplantar (suma, prima fija y tasa). */
function coberturasCosas(maplantar: Fila[]) {
  return maplantar.map((f) =>
    limpio({
      ccobertura: txt(f.ccober ?? f.ccobertura),
      ctarifa: txt(f.ctarifa),
      msumamin: numero(f.msumamin),
      msumamax: numero(f.msumamax),
      mprima: numero(f.mprima),
      pprima: numero(f.pprima),
    }),
  );
}

/** Personas: coberturas de maplcober_per, parentescos de mapltarifas_per y edades de mapledades_per. */
function coberturasPersonas(filas: FilasPlan, adv: string[]) {
  const edades = new Map<number, { min?: number; max?: number }>();
  for (const e of filas.mapledades_per) {
    const cparen = numero(e.cparen);
    if (cparen !== undefined) edades.set(cparen, { min: numero(e.cemin_ase), max: numero(e.cemax_ase) });
  }
  if (filas.mapltarifas_per.length && !tiene(filas.mapltarifas_per, 'csexo')) {
    adv.push('mapltarifas_per no trae csexo: se usa A (ambos sexos).');
  }
  const montos = ['msuma', 'msumamax', 'mprima'];
  if (filas.mapltarifas_per.length && !montos.some((m) => tiene(filas.mapltarifas_per, m) || tiene(filas.maplcober_per, m))) {
    adv.push('Ni mapltarifas_per ni maplcober_per traen msuma/msumamax/mprima: se envían en 0 (valor por defecto de spMantPlanes).');
  }

  const codigos: string[] = [];
  for (const f of [...filas.maplcober_per, ...filas.mapltarifas_per]) {
    const c = txt(f.ccobertura);
    if (c && !codigos.includes(c)) codigos.push(c);
  }

  return codigos.map((ccobertura) => {
    const cob = filas.maplcober_per.find((f) => txt(f.ccobertura) === ccobertura);
    const tarifas = filas.mapltarifas_per.filter((f) => txt(f.ccobertura) === ccobertura);
    const ctarifa = txt(cob?.ctarifa) || txt(tarifas.find((t) => txt(t.ctarifa))?.ctarifa);
    if (!ctarifa) adv.push(`Cobertura ${ccobertura}: no se encontró la tarifa (ctarifa); complétala antes de restaurar.`);
    if (!cob) adv.push(`Cobertura ${ccobertura}: está en mapltarifas_per pero no en maplcober_per.`);
    if (!tarifas.length) adv.push(`Cobertura ${ccobertura}: sin parentescos en mapltarifas_per.`);

    const parentescos = tarifas.map((t) => {
      const cparen = numero(t.cparen);
      const e = cparen !== undefined ? edades.get(cparen) : undefined;
      if (!e || e.min === undefined || e.max === undefined) {
        adv.push(`Cobertura ${ccobertura}, parentesco ${cparen ?? '?'}: sin edades en mapledades_per.`);
      }
      return limpio({
        cparen,
        csexo: txt(t.csexo) || 'A',
        ctablatar: txt(t.ctablatar),
        nedad_min: e?.min,
        nedad_max: e?.max,
        msuma: numero(t.msuma ?? cob?.msuma),
        msumamax: numero(t.msumamax ?? cob?.msumamax),
        mprima: numero(t.mprima ?? cob?.mprima),
      });
    });

    return limpio({ ccobertura, ctarifa, bobligatoria: booleano(cob?.bobligatoria), parentescos });
  });
}

/** maplanes_frec → frecuencias (sin repetir ifrecuencia; spMantPlanes no acepta repetidas). */
function frecuenciasDelPlan(filas: Fila[], adv: string[]) {
  const out: Fila[] = [];
  for (const f of filas) {
    const ifrecuencia = txt(f.ifrecuencia);
    if (!ifrecuencia) continue;
    if (out.some((o) => o.ifrecuencia === ifrecuencia)) {
      adv.push(`maplanes_frec repite la frecuencia ${ifrecuencia} (p. ej. por días): se conserva la primera.`);
      continue;
    }
    const xfrecuencia = txt(f.xfrecuencia) || txt(f.xdescripcion);
    if (!xfrecuencia) adv.push(`Frecuencia ${ifrecuencia}: sin descripción (xfrecuencia).`);
    const ndias = numero(f.ndias);
    out.push(limpio({ ifrecuencia, xfrecuencia, ndias: ndias !== undefined && ndias > 0 ? Math.trunc(ndias) : undefined }));
  }
  return out;
}

/**
 * Plan completo a partir de sus filas. null si no existe en maplanes ni en maplanes_per.
 * Tipo: cosas si tiene maplantar; personas si tiene filas de personas; si no, según la tabla de cabecera.
 */
export function reconstruirPlan(filas: FilasPlan): PlanLeido | null {
  const cabCosas = filas.maplanes[0];
  const cabPersonas = filas.maplanes_per[0];
  if (!cabCosas && !cabPersonas) return null;

  const datosPersonas = filas.maplcober_per.length > 0 || filas.mapltarifas_per.length > 0;
  const type: 'cosas' | 'personas' =
    filas.maplantar.length > 0 ? 'cosas' : datosPersonas || (cabPersonas && !cabCosas) ? 'personas' : 'cosas';
  const cab = (type === 'personas' ? cabPersonas ?? cabCosas : cabCosas ?? cabPersonas) as Fila;
  const adv: string[] = [];

  let fhasta = fechaIso(cab.fhasta);
  if (!fhasta) {
    fhasta = '2099-12-31';
    adv.push('El plan no tiene fhasta: se usa 2099-12-31.');
  }
  const fdesde = fechaIso(cab.fdesde);
  if (!fdesde) adv.push('El plan no tiene fdesde; complétala antes de restaurar.');

  const coberturas = type === 'cosas' ? coberturasCosas(filas.maplantar) : coberturasPersonas(filas, adv);
  if (!coberturas.length) adv.push('El plan no tiene coberturas en Sis2000.');
  const frecuencias = frecuenciasDelPlan(filas.maplanes_frec, adv);
  if (!frecuencias.length) adv.push('El plan no tiene frecuencias en maplanes_frec.');

  const plan = limpio({
    type,
    cramo: numero(cab.cramo),
    cplan: txt(cab.cplan),
    xplan: txt(cab.xplan),
    cproducto: txt(cab.cproducto),
    fdesde,
    fhasta,
    cmoneda: txt(cab.cmoneda),
    itiporen: txt(cab.itiporen),
    idevolucion: txt(cab.idevolucion),
    xobservacion: txt(cab.xobservacion),
    ctipo: numero(cab.ctipo),
    ctenedor: numero(cab.ctenedor),
    cbeneficiario: numero(cab.cbeneficiario),
    bnacional: booleano(cab.bnacional),
    ...usuariosDelPlan(filas.mausuplan, adv),
    coberturas,
    frecuencias,
  });

  return { type, plan, advertencias: [...new Set(adv)], filas };
}
