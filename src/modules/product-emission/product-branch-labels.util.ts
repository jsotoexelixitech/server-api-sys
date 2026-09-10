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
  FUNERARIO: 'GASTOS FUNERARIOS',
  PERSONAS: 'ACCIDENTES PERSONALES',
};

export function branchToRamoPolizaLabel(
  branch: string,
  template?: 'automovil' | 'salud' | 'funerario' | 'personas',
): string {
  // Plantilla funerario: productos VIDA con nombre funerario usan ese rótulo.
  if (template === 'funerario') return 'GASTOS FUNERARIOS';
  // Plantilla "personas" = layout genérico (sin vehículo). Solo etiquetar como
  // Accidentes Personales cuando el ramo es VIDA/PERSONAS — NO cuando es
  // PATRIMONIAL, INCLUSIVO, etc. (bug: "Naves" salía como ACCIDENTES PERSONALES).
  if (
    template === 'personas'
    && (branch === 'VIDA' || branch === 'PERSONAS')
  ) {
    return 'ACCIDENTES PERSONALES';
  }
  return BRANCH_LABELS[branch] ?? branch;
}
