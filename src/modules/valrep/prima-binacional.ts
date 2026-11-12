/**
 * Prima anual RCV Binacional (iplaca = B, ramo 28).
 *
 * La emisión (`sp_pre_emision_automovil_rcv_nexus`) toma como prima la suma de TODAS las
 * coberturas que devuelve `sp_calculo_auto_nexus` (`SUM(prima) FROM #montos_cotiza`):
 * RC (60) + APOV por puesto (67, 68 y 69). La cotización debe sumar lo mismo; antes
 * descartaba la 69 y cotizaba menos de lo que se emitía.
 */
export function sumPrimaBinacional(
  detalle: ReadonlyArray<{ prima?: number | string | null }>,
): number {
  const total = detalle.reduce((sum, row) => {
    const prima = Number(row?.prima ?? 0);
    return Number.isFinite(prima) ? sum + prima : sum;
  }, 0);
  return Math.round(total * 100) / 100;
}
