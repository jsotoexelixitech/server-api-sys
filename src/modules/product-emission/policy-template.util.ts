export type PolicyTemplateKey = 'automovil' | 'salud';

export function resolvePolicyTemplateKey(productBranch: string): PolicyTemplateKey {
  if (productBranch === 'SALUD') return 'salud';
  return 'automovil';
}

export function templateFileName(key: PolicyTemplateKey): string {
  return key === 'salud' ? 'template_salud.html' : 'template_automovil.html';
}
