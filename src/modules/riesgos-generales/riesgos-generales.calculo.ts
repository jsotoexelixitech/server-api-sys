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
): { pedidas: { ccober: string; suma: number }[]; errores: string[] } {
  if (calculo) {
    const suma = sumaPorCalculo(calculo);
    return { pedidas: pedidas.map((p) => ({ ccober: p.ccober, suma })), errores: [] };
  }
  const errores: string[] = [];
  const resueltas = pedidas.map((p) => {
    if (p.suma == null) errores.push(`La cobertura ${p.ccober} no tiene suma: envíe suma o calculo.`);
    return { ccober: p.ccober, suma: Number(p.suma ?? 0) };
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
