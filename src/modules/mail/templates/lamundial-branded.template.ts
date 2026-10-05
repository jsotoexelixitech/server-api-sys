/** Layout corporativo La Mundial reutilizable (funerario y mails de marca). */

export type BrandedField = { label: string; value: string };

export type LamundialBrandedParams = {
  subject: string;
  eyebrow: string;
  title: string;
  intro: string;
  fields?: BrandedField[];
  ctaLabel?: string;
  ctaUrl?: string;
  extraNote?: string;
  fallbackUrl?: string;
  callCenterPhone?: string;
};

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
};

const LOGO_URL =
  'https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg';
const BRAND_BLUE = '#0f3462';
const BRAND_RED = '#c8102e';
const MUTED = '#6b7280';

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function callCenter(raw?: string): string {
  return String(raw || process.env.CALL_CENTER_PHONE || '0800LaMundial').trim() || '0800LaMundial';
}

export function buildLamundialBrandedEmail(params: LamundialBrandedParams): BuiltEmail {
  const phone = callCenter(params.callCenterPhone);
  const fields = (params.fields || []).filter((f) => String(f?.label || '').trim());
  const ctaUrl = params.ctaUrl?.trim() || '';
  const ctaLabel = params.ctaLabel?.trim() || '';
  const extraNote = params.extraNote?.trim() || '';
  const fallbackUrl = params.fallbackUrl?.trim() || ctaUrl;

  const text = [
    'La Mundial de Seguros',
    '',
    params.eyebrow,
    params.title,
    '',
    params.intro,
    '',
    ...fields.map((f) => `${f.label}: ${f.value}`),
    ctaUrl ? `${ctaLabel || 'Enlace'}: ${ctaUrl}` : '',
    extraNote,
    '',
    `Teléfono: ${phone}`,
    'Correo: info@lamundialdeseguros.com',
    'Web: https://lamundialdeseguros.com/',
    '',
    'Mensaje automático. No respondas a este correo.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const fieldCells = fields
    .map(
      (f, i) => `
        ${i > 0 ? `<td width="1" style="background:#d1d5db;font-size:0;line-height:0;">&nbsp;</td>` : ''}
        <td style="padding:18px 10px;text-align:center;vertical-align:top;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">${escapeHtml(f.label)}</div>
          <div style="font-size:14px;font-weight:700;color:${BRAND_BLUE};">${escapeHtml(f.value)}</div>
        </td>`,
    )
    .join('');

  const fieldsHtml = fields.length
    ? `<tr>
            <td style="padding:24px 32px 0;">
              <div style="border-top:1px solid #d1d5db;border-bottom:1px solid #d1d5db;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>${fieldCells}</tr>
                </table>
              </div>
            </td>
          </tr>`
    : '';

  const ctaHtml =
    ctaUrl && ctaLabel
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 0;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:6px;">
              ${escapeHtml(ctaLabel)}
            </a>
          </td>
        </tr>
      </table>`
      : '';

  const extraHtml = extraNote
    ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${MUTED};text-align:center;">${escapeHtml(extraNote)}</p>`
    : '';

  const fallbackHtml =
    fallbackUrl && ctaLabel
      ? `<p style="margin:16px 0 0;font-size:11px;line-height:1.55;color:#9ca3af;text-align:center;word-break:break-all;">
        Si el botón no funciona, copia este enlace:<br>
        <a href="${escapeHtml(fallbackUrl)}" style="color:${BRAND_BLUE};">${escapeHtml(fallbackUrl)}</a>
      </p>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(params.subject)}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:${BRAND_BLUE};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;">
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;">
              <img src="${LOGO_URL}" alt="La Mundial de Seguros" style="width:220px;max-width:72%;height:auto;border:0;display:inline-block;">
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="height:3px;background:${BRAND_BLUE};font-size:0;line-height:0;">&nbsp;</td>
                  <td style="width:36px;height:3px;background:#cbd5e1;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="width:36px;height:3px;background:${BRAND_RED};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 0;text-align:center;">
              <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_RED};">
                ${escapeHtml(params.eyebrow)}
              </div>
              <h1 style="margin:18px 0 0;font-size:18px;font-weight:800;line-height:1.35;color:${BRAND_BLUE};text-transform:uppercase;">
                ${escapeHtml(params.title)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 0;text-align:center;">
              <p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND_BLUE};">${escapeHtml(params.intro)}</p>
            </td>
          </tr>
          ${fieldsHtml}
          <tr>
            <td style="padding:0 32px 28px;">
              ${ctaHtml}
              ${extraHtml}
              ${fallbackHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:${BRAND_BLUE};">
                Teléfono: ${escapeHtml(phone)}<br>
                Correo: <a href="mailto:info@lamundialdeseguros.com" style="color:${BRAND_BLUE};">info@lamundialdeseguros.com</a><br>
                Web: <a href="https://lamundialdeseguros.com/" style="color:${BRAND_BLUE};">lamundialdeseguros.com</a>
              </p>
              <p style="margin:16px 0 8px;font-size:16px;font-weight:800;color:${BRAND_BLUE};">La Mundial de Seguros</p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:${MUTED};">Mensaje automático. No respondas a este correo.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: params.subject, html, text };
}
