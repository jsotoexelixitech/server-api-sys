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
  suma: number;
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

export const COBERTURA_BASICA = '1';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const esObligatoria = (c: Pick<CoberturaTarifa, 'ccober' | 'obligatoria'>) =>
  c.obligatoria || c.ccober === COBERTURA_BASICA;

/**
 * Valida y calcula las coberturas pedidas contra la tarifa del plan.
 * Devuelve errores legibles en lugar de lanzar, para que el controlador responda 400 con todos juntos.
 */
export function calcularCoberturas(
  tarifa: CoberturaTarifa[],
  pedidas: CoberturaPedida[],
): { cotizacion: CotizacionCalculada | null; errores: string[] } {
  const errores: string[] = [];
  const porCob = new Map(tarifa.map((t) => [t.ccober, t]));
  const vistas = new Set<string>();

  for (const p of pedidas) {
    const t = porCob.get(p.ccober);
    if (!t) errores.push(`La cobertura ${p.ccober} no pertenece al plan.`);
    if (vistas.has(p.ccober)) errores.push(`La cobertura ${p.ccober} está repetida.`);
    vistas.add(p.ccober);
    if (!t) continue;
    if (!(Number(p.suma) > 0)) errores.push(`${t.xcobertura}: la suma debe ser mayor a 0.`);
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
