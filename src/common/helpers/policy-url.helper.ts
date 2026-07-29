/** URL base QA cuadro póliza (Sis2000). */
export const DEFAULT_POLICY_PDF_BASE =
  'https://qaapi.lamundialdeseguros.com/sis2000/poliza';

/** Normaliza base desde env; corrige valores truncados (.co sin /sis2000/...). */
export function resolvePolicyPdfBase(raw: string | undefined | null): string {
  const trimmed = String(raw ?? '').trim().replace(/\/$/, '');
  if (!trimmed) return DEFAULT_POLICY_PDF_BASE;
  if (/lamundialdeseguros\.com\/sis2000\/poliza/i.test(trimmed)) return trimmed;
  if (/lamundialdeseguros\.co$/i.test(trimmed)) return DEFAULT_POLICY_PDF_BASE;
  if (!/sis2000\/poliza/i.test(trimmed)) return DEFAULT_POLICY_PDF_BASE;
  return trimmed;
}

export function buildPolicyPdfUrl(
  pdfBase: string | undefined | null,
  cnpoliza: string,
  fanopol: number | undefined | null,
  fmespol: number | undefined | null,
): string {
  const poliza = String(cnpoliza ?? '').trim();
  if (!poliza || fanopol == null || fmespol == null) return '';
  const base = resolvePolicyPdfBase(pdfBase);
  return `${base}/${poliza}/${fanopol}/${fmespol}/`;
}
