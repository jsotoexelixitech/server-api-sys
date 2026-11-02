/**
 * Monto a cobrar de un SKU: misma regla que la cotización del flujo Farmatodo
 * (valrep.getCotizacionAuto / personas.getCotizacionPer): la prima del plan está en la
 * moneda del plan (`maplanes.cmoneda` / `maplanes_per.cmoneda`, ej. FARMPA en EUR/TCR),
 * se lleva a Bs con la tasa de esa moneda (`mamonedas.ptasamon`) y a USD con la tasa del dólar.
 */
export interface MontoCobrar {
  /** Moneda en que está expresada la prima del plan (`$`, `EUR`, `Bs`…). */
  cmoneda_plan: string;
  /** Tasa Bs de la moneda del plan. */
  ptasamon: number | null;
  /** Tasa Bs del dólar. */
  ptasamon_usd: number | null;
  /** Prima en la moneda del plan (= precio del plan). */
  mprimaext: number;
  /** Monto a cobrar en bolívares = mprimaext × ptasamon (redondeo a 2 decimales, igual que getCotizacionAuto). */
  mprima_bs: number | null;
  /** Monto a cobrar en USD = mprima_bs / tasa del dólar. Si el plan ya está en $, es el precio del plan. */
  musd: number | null;
}

const r2 = (n: number): number => parseFloat(n.toFixed(2));

export function esMonedaUsd(cmoneda?: string | null): boolean {
  const c = String(cmoneda ?? '$').trim().toUpperCase();
  return !c || c === '$' || c === 'USD';
}

export function esMonedaBs(cmoneda?: string | null): boolean {
  const c = String(cmoneda ?? '').trim().toUpperCase();
  return c === 'BS' || c === 'VES' || c === 'B';
}

export function calcularMontoCobrar(input: {
  mmonto: number | null | undefined;
  cmoneda?: string | null;
  ptasamon?: number | null;
  ptasamonUsd?: number | null;
}): MontoCobrar | null {
  const mmonto = Number(input.mmonto);
  if (input.mmonto == null || !Number.isFinite(mmonto) || mmonto <= 0) return null;

  const cmoneda = String(input.cmoneda ?? '$').trim() || '$';
  const tasaUsd = Number(input.ptasamonUsd);
  const ptasamonUsd = Number.isFinite(tasaUsd) && tasaUsd > 0 ? tasaUsd : null;

  if (esMonedaBs(cmoneda)) {
    return {
      cmoneda_plan: cmoneda,
      ptasamon: 1,
      ptasamon_usd: ptasamonUsd,
      mprimaext: r2(mmonto),
      mprima_bs: r2(mmonto),
      musd: ptasamonUsd ? r2(mmonto / ptasamonUsd) : null,
    };
  }

  // Plan en $ o en otra divisa: la tasa del plan; si no viene (o es $) se usa la del dólar.
  const tasaPlanRaw = Number(input.ptasamon);
  const tasaPlan = Number.isFinite(tasaPlanRaw) && tasaPlanRaw > 0 ? tasaPlanRaw : null;
  const ptasamon = esMonedaUsd(cmoneda) ? (ptasamonUsd ?? tasaPlan) : (tasaPlan ?? ptasamonUsd);

  const mprimaBs = ptasamon ? r2(mmonto * ptasamon) : null;
  const musd = esMonedaUsd(cmoneda)
    ? r2(mmonto)
    : mprimaBs != null && ptasamonUsd
      ? r2(mprimaBs / ptasamonUsd)
      : null;

  return {
    cmoneda_plan: cmoneda,
    ptasamon,
    ptasamon_usd: ptasamonUsd,
    mprimaext: r2(mmonto),
    mprima_bs: mprimaBs,
    musd,
  };
}
