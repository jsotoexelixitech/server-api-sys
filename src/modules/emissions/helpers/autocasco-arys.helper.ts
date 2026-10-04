/** Coberturas de casco que envía Auto Casco en createEmissionAuto. */
const AUTOCASCO_CASCO_COBER = new Set(['CA', 'PT', 'PP']);

/**
 * Emisión con prima de casco (Auto Casco paso 5): cober CA|PT|PP, suma asegurada y tasa casco.
 */
export function isAutocascoCascoEmission(body: Record<string, unknown>): boolean {
  const cober = String(body['coberAdicional'] ?? '')
    .trim()
    .toUpperCase();
  if (!AUTOCASCO_CASCO_COBER.has(cober)) return false;

  const suma = Number(body['msumaaseg'] ?? body['sumaaseg'] ?? 0);
  if (!Number.isFinite(suma) || suma <= 0) return false;

  const tasaCa = Number(body['tasaCa'] ?? 0);
  const tasaPt = Number(body['tasaPt'] ?? 0);
  const tasaPp = Number(body['tasaPp'] ?? 0);
  const tasaForCober =
    cober === 'CA' ? tasaCa : cober === 'PT' ? tasaPt : tasaPp;
  return Number.isFinite(tasaForCober) && tasaForCober > 0;
}

function canalHaystack(canal: Record<string, unknown>): string {
  return [
    canal['cprog'],
    canal['xcanal_venta'],
    canal['corigen_rel'],
    canal['ifuente_api'],
    canal['ifuente'],
    canal['xcliente'],
  ]
    .map((v) => String(v ?? '').trim().toUpperCase())
    .filter(Boolean)
    .join('|');
}

/** Coincide algún fragmento configurado (case-insensitive, sin regex). */
export function canalMatchesAutocascoPatterns(
  canal: Record<string, unknown>,
  patterns: string[],
): boolean {
  const normalized = patterns.map((p) => p.trim().toUpperCase()).filter(Boolean);
  if (!normalized.length) return false;
  const haystack = canalHaystack(canal);
  if (!haystack) return false;
  return normalized.some((p) => haystack.includes(p));
}

export type AutocascoArysGateOptions = {
  featureEnabled: boolean;
  canalPatterns: string[];
};

/**
 * ¿Disparar membresía Sarys post-emisión? Solo Auto Casco + casco, no emisiones RCV puras ni otros canales.
 */
export function shouldScheduleAutocascoArysMembership(
  body: Record<string, unknown>,
  canal: Record<string, unknown>,
  options: AutocascoArysGateOptions,
): boolean {
  if (!options.featureEnabled) return false;
  if (!isAutocascoCascoEmission(body)) return false;
  if (!options.canalPatterns.length) return false;
  return canalMatchesAutocascoPatterns(canal, options.canalPatterns);
}
