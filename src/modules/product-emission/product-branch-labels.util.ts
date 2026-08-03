/**
 * Traduce el `branch` (enum ProductBranch de proyecto-product-builder) al
 * texto que aparece en el campo "RAMO PÓLIZA" del cuadro-póliza generado.
 *
 * Este es el campo que el usuario pidió que cambie dinámicamente según el
 * ramo creado en product-builder (ej. "SALUD" → "RCV" → "AUTOMOVIL").
 */
const BRANCH_LABELS: Record<string, string> = {
  AUTOMOVIL: 'AUTOMOVIL',
  SALUD: 'SALUD',
  VIDA: 'VIDA',
  PATRIMONIAL: 'PATRIMONIAL',
  INCLUSIVO: 'INCLUSIVO',
  RCV_OBLIGATORIO: 'RCV',
};

export function branchToRamoPolizaLabel(branch: string): string {
  return BRANCH_LABELS[branch] ?? branch;
}
