// Cálculo por cobertura de riesgos generales (cotizador RC): la prima de cada cobertura elegida es
// suma × pprima / 100 con la tasa vigente de matarifa_d. Puro, sin BD, para probarlo aislado.

export interface CoberturaTarifa {
  ccober: string;
  ctarifa: string;
  xcobertura: string;
  /** Suma de la cobertura en el plan (maplantar.msumamax): valor por defecto. */
  msumaplan: number;
  /** Tasa vigente de matarifa_d (%). */
  pprima: number;
  /** Topes de matarifa_d; 0 = sin tope. */
  msumamin: number;
  msumamax: number;
  /** matarifa.bobligatoria = 'T'. La básica (ccober 1) también se trata como obligatoria. */
  obligatoria: boolean;
  /** Comisión de maarancel (%). */
  pcomision: number;
}

export interface CoberturaPedida {
  ccober: string;
  /** Tarifa (matarifa.ctarifa). Solo en modo combo y solo hace falta si la cobertura tiene varias tarifas vigentes. */
  ctarifa?: string;
  /** Suma de la cobertura. Opcional si viene `calculo` (se ignora y se reemplaza por unidades × valor_unidad). */
  suma?: number;
}

/** Cálculo genérico de la suma: unidades × valor_unidad, aplicado a todas las coberturas pedidas. */
export interface CalculoSuma {
  unidades: number;
  valor_unidad: number;
}

export interface CoberturaCalculada {
  ccober: string;
  ctarifa: string;
  xcobertura: string;
  suma_asegurada: number;
  pprima: number;
  prima: number;
  pcomision: number;
  comision: number;
}

export interface CotizacionCalculada {
  suma_asegurada: number;
  prima_total: number;
  comision_total: number;
  coberturas: CoberturaCalculada[];
}

/** Cobertura del ramo con tarifa vigente, sin plan (GET coberturas): base de las combinaciones del cotizador RC. */
export interface CoberturaRamo {
  ccober: string;
  ctarifa: string;
  xcobertura: string;
  /** Moneda de la cobertura (macoberturas.cmoneda). */
  cmoneda: string;
  /** matarifa.bobligatoria = 'T' o cobertura básica. */
  obligatoria: boolean;
  /** Tasa vigente de matarifa_d (%). */
  pprima: number;
  /** Prima fija vigente de matarifa_d. */
  mprima: number;
  /** Topes de matarifa_d; 0 = sin tope. */
  msumamin: number;
  msumamax: number;
  /** Comisión de maarancel (%). */
  pcomision: number;
}

/** Ramo patrimonial (maramos.ctiporamo 1 y 6) para el cotizador RC, tenga o no planes (GET ramos). */
export interface RamoPatrimonial {
  cramo: number;
  xramo: string;
  ctiporamo: number;
  /** Coberturas activas con tarifa vigente (las mismas de GET coberturas); 0 = no se puede cotizar por cobertura. */
  qcoberturas: number;
}

/** Dato del bien asegurado: se imprime como "etiqueta: valor". */
export interface DatoBien {
  etiqueta: string;
  valor: string;
}

export interface DatosBienCompuestos {
  xdescrip3: string | null;
  xdescrip4: string | null;
  /** Etiquetas de los datos que no cupieron. */
  omitidos: string[];
}

/** xdescrip3 y xdescrip4 son VARCHAR(250). */
export const LIMITE_XDESCRIP = 250;

export const COBERTURA_BASICA = '1';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const esObligatoria = (c: Pick<CoberturaTarifa, 'ccober' | 'obligatoria'>) =>
  c.obligatoria || c.ccober === COBERTURA_BASICA;

/** Fila de macoberturas + matarifa + matarifa_d vigente + maarancel → CoberturaRamo. */
export function mapCoberturaRamo(r: Record<string, unknown>): CoberturaRamo {
  const ccober = String(r.ccober ?? '').trim();
  return {
    ccober,
    ctarifa: String(r.ctarifa ?? '').trim(),
    xcobertura: String(r.xcobertura ?? '').trim(),
    cmoneda: String(r.cmoneda ?? '$').trim(),
    obligatoria: esObligatoria({ ccober, obligatoria: String(r.bobligatoria ?? '').trim().toUpperCase() === 'T' }),
    pprima: Number(r.pprima ?? 0),
    mprima: Number(r.mprima ?? 0),
    msumamin: Number(r.msumamin ?? 0),
    msumamax: Number(r.msumamax ?? 0),
    pcomision: Number(r.pcomision ?? 0),
  };
}

/** Fila de maramos + conteo de coberturas con tarifa vigente → RamoPatrimonial. */
export function mapRamoPatrimonial(r: Record<string, unknown>): RamoPatrimonial {
  return {
    cramo: Number(r.cramo),
    xramo: String(r.xramo ?? '').trim(),
    ctiporamo: Number(r.ctiporamo ?? 0),
    qcoberturas: Number(r.qcoberturas ?? 0),
  };
}

/** Suma asegurada a partir del cálculo genérico: unidades × valor_unidad, redondeada a 2 decimales. */
export const sumaPorCalculo = (c: CalculoSuma) => r2(c.unidades * c.valor_unidad);

/**
 * Resuelve la suma de cada cobertura pedida: con `calculo` todas valen unidades × valor_unidad (se ignora `suma`);
 * sin `calculo` cada cobertura debe traer su `suma`. Devuelve errores legibles por cobertura sin suma.
 */
export function resolverSumas(
  pedidas: CoberturaPedida[],
  calculo?: CalculoSuma,
): { pedidas: { ccober: string; ctarifa?: string; suma: number }[]; errores: string[] } {
  const base = (p: CoberturaPedida) => ({ ccober: p.ccober, ...(p.ctarifa?.trim() ? { ctarifa: p.ctarifa.trim() } : {}) });
  if (calculo) {
    const suma = sumaPorCalculo(calculo);
    return { pedidas: pedidas.map((p) => ({ ...base(p), suma })), errores: [] };
  }
  const errores: string[] = [];
  const resueltas = pedidas.map((p) => {
    if (p.suma == null) errores.push(`La cobertura ${p.ccober} no tiene suma: envíe suma o calculo.`);
    return { ...base(p), suma: Number(p.suma ?? 0) };
  });
  return { pedidas: resueltas, errores };
}

/**
 * Suma meses a una fecha (UTC) respetando el fin de mes: 31-ago + 6 = 28-feb (29 en bisiesto).
 * Evita el desborde de setMonth (31-ago + 6 → 3-mar).
 */
export function sumarMeses(fecha: Date, meses: number): Date {
  const y = fecha.getUTCFullYear();
  const m = fecha.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(fecha.getUTCDate(), ultimoDia)));
}

/**
 * Reparte los datos del bien en xdescrip3 y xdescrip4 sin partir ninguno y conservando el orden. Lo que no cabe
 * se devuelve en `omitidos`, nunca se corta a medias.
 */
export function componerDatosBien(datos: DatoBien[], limite = LIMITE_XDESCRIP): DatosBienCompuestos {
  const campos = ['', ''];
  const omitidos: string[] = [];
  let i = 0;
  for (const d of datos) {
    const limpio = (t: string) => t.replace(/\s+/g, ' ').trim();
    const texto = `${limpio(d.etiqueta)}: ${limpio(d.valor)}`;
    const cabe = (c: string) => (c ? c.length + 2 : 0) + texto.length <= limite;
    if (texto.length > limite) {
      omitidos.push(d.etiqueta);
      continue;
    }
    if (!cabe(campos[i])) i = 1;
    if (cabe(campos[i])) campos[i] += (campos[i] ? '; ' : '') + texto;
    else omitidos.push(d.etiqueta);
  }
  return { xdescrip3: campos[0] || null, xdescrip4: campos[1] || null, omitidos };
}

/**
 * Valida y calcula las coberturas pedidas contra la tarifa del plan.
 * Devuelve errores legibles en lugar de lanzar, para que el controlador responda 400 con todos juntos.
 * Con `calculo`, la suma de cada cobertura es unidades × valor_unidad (se ignora cualquier `suma` enviada).
 */
export function calcularCoberturas(
  tarifa: CoberturaTarifa[],
  pedidasEntrada: CoberturaPedida[],
  calculo?: CalculoSuma,
): { cotizacion: CotizacionCalculada | null; errores: string[] } {
  const { pedidas, errores: erroresSuma } = resolverSumas(pedidasEntrada, calculo);
  if (erroresSuma.length) return { cotizacion: null, errores: erroresSuma };
  const errores: string[] = [];
  const porCob = new Map(tarifa.map((t) => [t.ccober, t]));
  const vistas = new Set<string>();

  for (const p of pedidas) {
    const t = porCob.get(p.ccober);
    if (!t) errores.push(`La cobertura ${p.ccober} no pertenece al plan.`);
    if (vistas.has(p.ccober)) errores.push(`La cobertura ${p.ccober} está repetida.`);
    vistas.add(p.ccober);
    if (!t) continue;
    if (!(p.suma > 0)) errores.push(`${t.xcobertura}: la suma debe ser mayor a 0.`);
    if (t.msumamin > 0 && p.suma < t.msumamin) errores.push(`${t.xcobertura}: la suma mínima es ${t.msumamin}.`);
    if (t.msumamax > 0 && p.suma > t.msumamax) errores.push(`${t.xcobertura}: la suma máxima es ${t.msumamax}.`);
    if (!(t.pprima > 0)) errores.push(`${t.xcobertura}: no tiene tasa vigente en matarifa_d.`);
  }
  for (const t of tarifa) {
    if (esObligatoria(t) && !vistas.has(t.ccober)) errores.push(`${t.xcobertura} es obligatoria.`);
  }
  if (errores.length) return { cotizacion: null, errores };

  const coberturas = pedidas.map((p) => {
    const t = porCob.get(p.ccober)!;
    const suma = r2(p.suma);
    const prima = r2((suma * t.pprima) / 100);
    return {
      ccober: t.ccober, ctarifa: t.ctarifa, xcobertura: t.xcobertura, suma_asegurada: suma, pprima: t.pprima,
      prima, pcomision: t.pcomision, comision: r2((prima * t.pcomision) / 100),
    };
  });
  const basica = coberturas.find((c) => c.ccober === COBERTURA_BASICA);
  return {
    errores: [],
    cotizacion: {
      // Suma asegurada de la póliza = la de la básica (o la mayor si el plan no tiene ccober 1).
      suma_asegurada: basica ? basica.suma_asegurada : Math.max(...coberturas.map((c) => c.suma_asegurada)),
      prima_total: r2(coberturas.reduce((s, c) => s + c.prima, 0)),
      comision_total: r2(coberturas.reduce((s, c) => s + c.comision, 0)),
      coberturas,
    },
  };
}

/**
 * Modo combo: valida y calcula las coberturas pedidas contra las del RAMO con tarifa vigente (GET coberturas), sin
 * maplantar; el plan solo es contenedor. Misma regla del cotizador RC: prima = suma × pprima / 100 o, si la tarifa no
 * tiene tasa, la prima fija (mprima) de matarifa_d. Sin prima mínima, recargo ni descuento. Las obligatorias del ramo
 * (bobligatoria o básica) deben venir. Si una cobertura tiene varias tarifas vigentes hay que indicar `ctarifa`.
 */
export function calcularCoberturasRamo(
  catalogo: CoberturaRamo[],
  pedidasEntrada: CoberturaPedida[],
  calculo?: CalculoSuma,
): { cotizacion: CotizacionCalculada | null; errores: string[] } {
  const { pedidas, errores: erroresSuma } = resolverSumas(pedidasEntrada, calculo);
  if (erroresSuma.length) return { cotizacion: null, errores: erroresSuma };
  const errores: string[] = [];
  const vistas = new Set<string>();
  const elegidas: { t: CoberturaRamo; suma: number }[] = [];

  for (const p of pedidas) {
    const tarifas = catalogo.filter((t) => t.ccober === p.ccober);
    const t = p.ctarifa ? tarifas.find((x) => x.ctarifa === p.ctarifa) : tarifas.length === 1 ? tarifas[0] : undefined;
    if (vistas.has(p.ccober)) errores.push(`La cobertura ${p.ccober} está repetida.`);
    vistas.add(p.ccober);
    if (!tarifas.length) { errores.push(`La cobertura ${p.ccober} no es del ramo o no tiene tarifa vigente.`); continue; }
    if (!t) {
      errores.push(p.ctarifa
        ? `La cobertura ${p.ccober} no tiene la tarifa ${p.ctarifa} vigente en el ramo.`
        : `La cobertura ${p.ccober} tiene varias tarifas vigentes (${tarifas.map((x) => x.ctarifa).join(', ')}): indique ctarifa.`);
      continue;
    }
    if (!(p.suma > 0)) errores.push(`${t.xcobertura}: la suma debe ser mayor a 0.`);
    if (t.msumamin > 0 && p.suma < t.msumamin) errores.push(`${t.xcobertura}: la suma mínima es ${t.msumamin}.`);
    if (t.msumamax > 0 && p.suma > t.msumamax) errores.push(`${t.xcobertura}: la suma máxima es ${t.msumamax}.`);
    if (!(t.pprima > 0) && !(t.mprima > 0)) errores.push(`${t.xcobertura}: no tiene tasa ni prima fija vigente en matarifa_d.`);
    elegidas.push({ t, suma: p.suma });
  }
  const obligatorias = new Map(catalogo.filter((t) => t.obligatoria).map((t) => [t.ccober, t]));
  for (const t of obligatorias.values()) {
    if (!vistas.has(t.ccober)) errores.push(`${t.xcobertura} es obligatoria.`);
  }
  if (errores.length) return { cotizacion: null, errores };

  const coberturas = elegidas.map(({ t, suma: s }) => {
    const suma = r2(s);
    const prima = t.pprima > 0 ? r2((suma * t.pprima) / 100) : r2(t.mprima);
    return {
      ccober: t.ccober, ctarifa: t.ctarifa, xcobertura: t.xcobertura, suma_asegurada: suma, pprima: t.pprima,
      prima, pcomision: t.pcomision, comision: r2((prima * t.pcomision) / 100),
    };
  });
  const basica = coberturas.find((c) => c.ccober === COBERTURA_BASICA);
  return {
    errores: [],
    cotizacion: {
      suma_asegurada: basica ? basica.suma_asegurada : Math.max(...coberturas.map((c) => c.suma_asegurada)),
      prima_total: r2(coberturas.reduce((s, c) => s + c.prima, 0)),
      comision_total: r2(coberturas.reduce((s, c) => s + c.comision, 0)),
      coberturas,
    },
  };
}

/** Ramos 28 y 38: el SP exige número de apartamento o unidad (clave asegurado + plan + unidad). */
export const RAMOS_CON_UNIDAD = [28, 38] as const;

/** Ramos de emisión por defecto (comportamiento previo a RIESGOS_GENERALES_RAMOS_EMISION). */
export const RAMOS_EMISION_DEFECTO = [16, 25, 38] as const;

/** RCV: nunca se emite por esta ruta, aunque esté en la lista. */
export const RAMO_RCV = 26;

/**
 * RIESGOS_GENERALES_RAMOS_EMISION: 'todos' (cualquier ramo patrimonial vigente, ctiporamo 1 y 6, salvo RCV) o lista de
 * cramo separados por coma. Vacía o sin ningún número válido: el valor por defecto 16,25,38.
 */
export function parsearRamosEmision(raw: unknown): 'todos' | number[] {
  const t = String(raw ?? '').trim().toLowerCase();
  if (t === 'todos') return 'todos';
  const lista = [...new Set(t.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0 && n !== RAMO_RCV))];
  return lista.length ? lista : [...RAMOS_EMISION_DEFECTO];
}

/** Fila de la validación previa al SP: conteos por cobertura enviada (macoberturas, matarifa, matarifa_d). */
export interface ChequeoCobertura {
  ccober: string;
  ctarifa: string;
  /** macoberturas.iestado de la cobertura en el ramo; null si no existe. */
  iestado: string | null;
  qtarifa: number;
  qdetalle: number;
}

/**
 * Lo que sp_emision_condominio_nexus necesita de cada cobertura: existir activa en macoberturas del ramo, tener fila en
 * matarifa y EXACTAMENTE una en matarifa_d (el SP une sin filtrar vigencia: con 0 filas la cobertura desaparece de la
 * póliza y con 2 o más se duplica).
 */
export function erroresCoberturasSp(cramo: number, filas: ChequeoCobertura[]): string[] {
  const aviso = 'avisar a La Mundial';
  return filas.flatMap((f) => {
    const id = `La cobertura ${f.ccober} (tarifa ${f.ctarifa})`;
    if (f.iestado == null) return [`${id} no existe en el ramo ${cramo}.`];
    if (String(f.iestado).trim().toUpperCase() !== 'V') return [`${id} no está activa en el ramo ${cramo}.`];
    if (!(Number(f.qtarifa) > 0)) return [`${id} no se puede emitir: no tiene tarifa en matarifa; ${aviso}.`];
    if (Number(f.qdetalle) === 0) return [`${id} no se puede emitir: tarifa sin detalle en matarifa_d; ${aviso}.`];
    if (Number(f.qdetalle) > 1) return [`${id} no se puede emitir: tarifa con detalle repetido en matarifa_d (${f.qdetalle} filas); ${aviso}.`];
    return [];
  });
}

/** Mensaje claro para el duplicado que lanza sp_pre_emision_condominio_nexus; null si es otro error. */
export function traducirDuplicadoSp(msg: string, cramo: number, cplan: string, unidad?: number): string | null {
  if (!/p[oó]liza vigente con el mismo asegurado/i.test(msg)) return null;
  if (/apartamento/i.test(msg)) {
    return `El asegurado ya tiene una póliza vigente del plan ${cplan} (ramo ${cramo}) para la unidad ${unidad ?? '—'}. `
      + 'Indique otra unidad o apartamento, o espere al vencimiento o la anulación de esa póliza.';
  }
  return `El asegurado ya tiene una póliza vigente del plan ${cplan} en el ramo ${cramo}: Sis2000 no permite otra con el mismo `
    + 'asegurado y plan. Elija otro plan contenedor del ramo, o espere al vencimiento o la anulación de esa póliza.';
}

// ── Modo cotizador: prima informada ─────────────────────────────────────────────────────────────────────────────────
// En los ramos patrimoniales sin tarifa en Sis2000 (RC General 28, RC Patronal 27, RC Empresarial 37 y los del combo que
// se habiliten) la prima la fija Técnico o el cotizador RC, no matarifa_d. Este modo acepta la prima de cada cobertura y
// la valida; nunca la recalcula. Está protegido por variable de entorno y por un scope explícito (ver servicio).

/** Ramos del modo cotizador por defecto: 27 (RC Patronal), 28 (RC General) y 37 (RC Empresarial). */
export const RAMOS_COTIZADOR_DEFECTO = [27, 28, 37] as const;

/** Origen de la prima informada. */
export const ORIGENES_COTIZADOR = ['rcg', 'rcp', 'rce', 'combo'] as const;
export type OrigenCotizador = (typeof ORIGENES_COTIZADOR)[number];

/**
 * RIESGOS_GENERALES_COTIZADOR_RAMOS: lista explícita de cramo separados por coma (sin 'todos': cada ramo se habilita a
 * propósito). Vacía o sin números válidos: 27, 28 y 37. RCV (26) nunca.
 */
export function parsearRamosCotizador(raw: unknown): number[] {
  const lista = [...new Set(String(raw ?? '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0 && n !== RAMO_RCV))];
  return lista.length ? lista : [...RAMOS_COTIZADOR_DEFECTO];
}

/** Cobertura pedida con la prima que fijó el cotizador o Técnico. */
export interface CoberturaInformada {
  ccober: string;
  ctarifa?: string;
  suma?: number;
  prima?: number;
}

/** '$', 'US$', 'USD' → USD; 'BS', 'BS.', 'VES', 'BSD' → BS; 'EUR', '€' → EUR; otro código → tal cual en mayúsculas. */
export function normalizarMoneda(m: unknown): string {
  const t = String(m ?? '').trim().toUpperCase().replace(/\.$/, '');
  if (['$', 'US$', 'USD', 'DOLAR', 'DÓLAR'].includes(t)) return 'USD';
  if (['BS', 'VES', 'VEF', 'BSD', 'BSS', 'BS.S', 'BOLIVAR', 'BOLÍVAR'].includes(t)) return 'BS';
  if (['EUR', '€', 'EURO'].includes(t)) return 'EUR';
  return t;
}

/** Diferencia aceptada entre la prima total y la suma de las primas: medio céntimo por cobertura (redondeos) y un céntimo mínimo. */
export const toleranciaPrima = (n: number) => r2(Math.max(0.01, n * 0.005));

/**
 * Modo cotizador: valida las coberturas con su prima informada contra las del ramo (GET coberturas) y arma la cotización
 * SIN recalcular la prima. Reglas: cada cobertura existe en el ramo (con `ctarifa` si tiene varias), sin repetir, suma > 0,
 * prima ≥ 0, todas en la misma moneda (y la del plan contenedor si se indica); prima total > 0 e igual a la suma de las
 * primas con tolerancia de redondeo. No aplica topes ni obligatorias de matarifa_d: la tarifa la aplica Técnico.
 */
export function calcularCoberturasInformadas(
  catalogo: CoberturaRamo[],
  pedidas: CoberturaInformada[],
  primaTotal: unknown,
  monedaPlan?: string,
): { cotizacion: CotizacionCalculada | null; errores: string[] } {
  const errores: string[] = [];
  const vistas = new Set<string>();
  const elegidas: { t: CoberturaRamo; suma: number; prima: number }[] = [];
  if (!pedidas.length) errores.push('Envíe al menos una cobertura.');

  for (const p of pedidas) {
    const ctarifa = p.ctarifa?.trim();
    const tarifas = catalogo.filter((t) => t.ccober === p.ccober);
    const t = ctarifa ? tarifas.find((x) => x.ctarifa === ctarifa) : tarifas.length === 1 ? tarifas[0] : undefined;
    if (vistas.has(p.ccober)) errores.push(`La cobertura ${p.ccober} está repetida.`);
    vistas.add(p.ccober);
    if (!tarifas.length) { errores.push(`La cobertura ${p.ccober} no es del ramo o no tiene tarifa vigente.`); continue; }
    if (!t) {
      errores.push(ctarifa
        ? `La cobertura ${p.ccober} no tiene la tarifa ${ctarifa} vigente en el ramo.`
        : `La cobertura ${p.ccober} tiene varias tarifas vigentes (${tarifas.map((x) => x.ctarifa).join(', ')}): indique ctarifa.`);
      continue;
    }
    const suma = Number(p.suma);
    const prima = Number(p.prima);
    if (!(Number.isFinite(suma) && suma > 0)) errores.push(`${t.xcobertura}: la suma debe ser mayor a 0.`);
    if (p.prima == null || !Number.isFinite(prima)) errores.push(`${t.xcobertura}: falta la prima de la cobertura.`);
    else if (prima < 0) errores.push(`${t.xcobertura}: la prima no puede ser negativa.`);
    elegidas.push({ t, suma, prima });
  }

  const monedas = [...new Set(elegidas.map((e) => normalizarMoneda(e.t.cmoneda)))];
  if (monedas.length > 1) errores.push(`Las coberturas mezclan monedas (${monedas.join(', ')}): use las de una sola moneda.`);
  const mPlan = monedaPlan ? normalizarMoneda(monedaPlan) : '';
  if (monedas.length === 1 && mPlan && ['USD', 'BS', 'EUR'].includes(mPlan) && ['USD', 'BS', 'EUR'].includes(monedas[0]) && mPlan !== monedas[0]) {
    errores.push(`Las coberturas son en ${monedas[0]} y el plan contenedor en ${mPlan}: elija un plan de la misma moneda.`);
  }

  const total = Number(primaTotal);
  if (!(Number.isFinite(total) && total > 0)) errores.push('La prima total debe ser mayor a 0: no se emite una póliza sin prima.');
  if (errores.length) return { cotizacion: null, errores };

  const coberturas = elegidas.map(({ t, suma: s, prima: p }) => {
    const suma = r2(s);
    const prima = r2(p);
    return {
      ccober: t.ccober, ctarifa: t.ctarifa, xcobertura: t.xcobertura, suma_asegurada: suma,
      // Tasa aplicada (informativa): prima / suma × 100.
      pprima: suma > 0 ? Math.round((prima * 100 / suma) * 1e6) / 1e6 : 0,
      prima, pcomision: t.pcomision, comision: r2((prima * t.pcomision) / 100),
    };
  });
  const suma = r2(coberturas.reduce((s, c) => s + c.prima, 0));
  if (Math.abs(suma - r2(total)) > toleranciaPrima(coberturas.length) + 1e-9) {
    return { cotizacion: null, errores: [`La prima total (${r2(total)}) no coincide con la suma de las primas por cobertura (${suma}).`] };
  }
  const basica = coberturas.find((c) => c.ccober === COBERTURA_BASICA);
  return {
    errores: [],
    cotizacion: {
      suma_asegurada: basica ? basica.suma_asegurada : Math.max(...coberturas.map((c) => c.suma_asegurada)),
      // Se emite la suma de las primas por cobertura: así el total de la póliza cuadra con su detalle.
      prima_total: suma,
      comision_total: r2(coberturas.reduce((s, c) => s + c.comision, 0)),
      coberturas,
    },
  };
}
