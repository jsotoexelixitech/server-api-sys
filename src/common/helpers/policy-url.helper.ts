/** URL base QA cuadro póliza (Sis2000). */
export const DEFAULT_POLICY_PDF_BASE =
  'https://qaapi.lamundialdeseguros.com/sis2000/poliza';

/** URL base QA comprobante ingreso de caja (Sis2000). */
export const DEFAULT_INGRESO_CAJA_BASE =
  'https://qaapi.lamundialdeseguros.com/sis2000/ingreso_caja';

/** PDF estático Club Arys (mismo asset que SysIP QA). */
export const DEFAULT_ARYS_TRADICIONAL_PDF_URL =
  'https://qasys2000.lamundialdeseguros.com/assets/Arys_Tradicional.pdf';

export const DEFAULT_ARYS_AUTO_BI_PDF_URL =
  'https://qasys2000.lamundialdeseguros.com/assets/ArysAutoBi.pdf';

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

export function resolveIngresoCajaBase(raw: string | undefined | null): string {
  const trimmed = String(raw ?? '').trim().replace(/\/$/, '');
  if (!trimmed) return DEFAULT_INGRESO_CAJA_BASE;
  return trimmed;
}

export function buildIngresoCajaUrl(
  pdfBase: string | undefined | null,
  ctransaccion: number | string | undefined | null,
): string {
  const tx = Number(ctransaccion);
  if (!Number.isFinite(tx) || tx <= 0) return '';
  const base = resolveIngresoCajaBase(pdfBase);
  return `${base}/${tx}/`;
}

export function resolveClubArysPdfUrl(
  hasCoverage: boolean,
  iplaca: unknown,
  tradicionalUrl?: string | null,
  autoBiUrl?: string | null,
): string {
  if (!hasCoverage) return '';
  const trad = String(tradicionalUrl ?? '').trim() || DEFAULT_ARYS_TRADICIONAL_PDF_URL;
  const bi = String(autoBiUrl ?? '').trim() || DEFAULT_ARYS_AUTO_BI_PDF_URL;
  if (String(iplaca ?? '').trim().toUpperCase() === 'B') return bi;
  return trad;
}
