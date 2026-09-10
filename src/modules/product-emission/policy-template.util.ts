export type PolicyTemplateKey = 'automovil' | 'salud' | 'funerario' | 'personas';

export interface PolicyTemplateHints {
  productName?: string;
  internalCode?: string;
  templateOverride?: PolicyTemplateKey;
}

export function resolvePolicyTemplateKey(
  productBranch: string,
  hints: PolicyTemplateHints = {},
): PolicyTemplateKey {
  if (hints.templateOverride) return hints.templateOverride;

  const blob = `${hints.productName ?? ''} ${hints.internalCode ?? ''}`.toUpperCase();

  if (productBranch === 'SALUD') return 'salud';
  if (blob.includes('FUNER') || blob.includes('GASTOS FUNER')) return 'funerario';
  if (
    productBranch === 'VIDA' ||
    blob.includes('ACCIDENT') ||
    blob.includes('PERSONAS') ||
    blob.includes('AP ')
  ) {
    return 'personas';
  }
  if (
    productBranch === 'AUTOMOVIL' ||
    productBranch === 'RCV_OBLIGATORIO' ||
    blob.includes('AUTO')
  ) {
    return 'automovil';
  }
  // Ramos nuevos sin plantilla dedicada: cuadro genérico de personas
  // (la plantilla automóvil mostraría una sección de vehículo vacía).
  return 'personas';
}

export function templateFileName(key: PolicyTemplateKey): string {
  switch (key) {
    case 'salud':
      return 'template_salud.html';
    case 'funerario':
      return 'template_gastos_funerarios.html';
    case 'personas':
      return 'template_accidentes_personales.html';
    default:
      return 'template_automovil.html';
  }
}
