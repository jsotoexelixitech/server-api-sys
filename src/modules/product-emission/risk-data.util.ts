/** Normaliza claves de riskData (labels de FormField en product-builder). */
export function pickRiskValue(
  risk: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  if (!risk) return '';
  const entries = Object.entries(risk);
  for (const key of keys) {
    const found = entries.find(
      ([k]) => k.trim().toLowerCase() === key.trim().toLowerCase(),
    );
    if (found && found[1] != null && String(found[1]).trim() !== '') {
      return String(found[1]).trim();
    }
  }
  return '';
}
