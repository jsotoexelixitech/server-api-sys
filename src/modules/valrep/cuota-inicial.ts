import type { CalculatePlanCoberturasRow } from './valrep.service';

/**
 * Coberturas que se cobran completas en la cuota inicial cuando la frecuencia no es anual:
 * Daños a personas (ccoberturaint 15) y Daños a cosas (17), mismo ccoberturaint en ramos 18 y 26.
 * Debe coincidir con el parámetro @coberturas_cuota_inicial de sp_genera_coberturas_recibos_auto_rcv_nexus,
 * que reparte los recibos en Sis2000; si cambia uno, hay que cambiar el otro.
 */
export const COBERTURAS_CUOTA_INICIAL_DEFAULT = '15,17';

export function parseCoberturasCuotaInicial(raw?: string | null): Set<string> {
  const value = raw?.trim() ? raw : COBERTURAS_CUOTA_INICIAL_DEFAULT;
  return new Set(
    value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== ''),
  );
}

/**
 * Prima anual (USD) de las coberturas que no se fraccionan: van completas en la cuota inicial.
 * La cuota inicial queda en `primaCuotaInicial + (primaAnual - primaCuotaInicial) / cuotas`.
 */
export function sumPrimaCuotaInicial(
  detalle: CalculatePlanCoberturasRow[],
  coberturas: Set<string>,
): number {
  const total = detalle.reduce((sum, row) => {
    const cint = String(row['ccoberturaint'] ?? '').trim();
    if (!coberturas.has(cint)) return sum;
    const prima = Number(row.prima ?? 0);
    return Number.isFinite(prima) && prima > 0 ? sum + prima : sum;
  }, 0);
  return Math.round(total * 100) / 100;
}
