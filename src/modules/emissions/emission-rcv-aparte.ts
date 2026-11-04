/** Fila que devuelve el SP de emisión por cada póliza (cpoliza, cnpoliza, cnrecibo, ...). */
export type EmissionRow = Record<string, unknown>;

export interface EmissionRows {
  /** Póliza del plan solicitado. Vacía si el SP no devolvió cnpoliza. */
  principal: EmissionRow;
  /** Póliza de RCV aparte (grupo RCVA de separam, p. ej. plan LARA → ramo 26). */
  rcvAparte: EmissionRow | null;
}

const cnpolizaOf = (row: EmissionRow): string => String(row['cnpoliza'] ?? '').trim();

/**
 * Separa las pólizas que devuelve sp_pre_emision_automovil_rcv_nexus: primero la del plan y, si el plan
 * emite el RCV aparte, después la del RCV. Si una póliza trae varias filas se usa la última.
 */
export function splitEmissionRows(result: {
  recordset?: EmissionRow[];
  recordsets?: EmissionRow[][];
}): EmissionRows {
  const recordsets = result.recordsets?.length ? result.recordsets : [result.recordset ?? []];
  const rows = recordsets.map((rs) => rs?.[0]).filter((row) => row && cnpolizaOf(row));
  if (!rows.length) return { principal: {}, rcvAparte: null };

  const cnpolizaPlan = cnpolizaOf(rows[0]);
  const delPlan = rows.filter((row) => cnpolizaOf(row) === cnpolizaPlan);
  const otras = rows.filter((row) => cnpolizaOf(row) !== cnpolizaPlan);
  return { principal: delPlan[delPlan.length - 1], rcvAparte: otras[otras.length - 1] ?? null };
}
