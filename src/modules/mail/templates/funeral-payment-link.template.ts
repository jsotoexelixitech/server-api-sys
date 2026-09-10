/** Plantilla funerario — layout corporativo La Mundial (marca oficial, imagen 2). */

export type FuneralPaymentLinkEmail = {
  subject: string;
  html: string;
  text: string;
};

export type FuneralPaymentLinkParams = {
  nombre: string;
  planName: string;
  paymentUrl: string;
  expiresLabel?: string;
  callCenterPhone?: string;
};

const LOGO_URL =
  'https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg';
const BRAND_BLUE = '#0f3462';
const BRAND_RED = '#c8102e';
const MUTED = '#6b7280';
const HIGHLIGHT = '#fef08a';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatEstimado(nombre: string): string {
  return nombre.trim().toUpperCase() || 'CLIENTE';
}

function highlightWord(text: string, word: string): string {
  const escaped = escapeHtml(text);
  const pattern = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(
    pattern,
    `<span style="background:${HIGHLIGHT};padding:0 2px;">$1</span>`,
  );
}

export function buildFuneralPaymentLinkEmail(
  params: FuneralPaymentLinkParams,
): FuneralPaymentLinkEmail {
  const callCenterPhone =
    String(params.callCenterPhone || process.env.CALL_CENTER_PHONE || '0800LaMundial').trim()
    || '0800LaMundial';
  const nombre = params.nombre.trim() || 'Cliente';
  const estimado = formatEstimado(nombre);
  const planName = params.planName.trim() || 'Funerario Individual';
  const paymentUrl = params.paymentUrl.trim();
  const expiresLabel = params.expiresLabel?.trim() || '';

  const subject = `La Mundial · Pago de póliza funerario — ${planName}`;

  const text = [
    'La Mundial de Seguros',
    '',
    `Estimado ${estimado},`,
    '',
    `Tu plan ${planName} está listo. Pulsa el enlace para continuar con el pago en línea; tus datos ya están cargados.`,
    '',
    'Producto: Funerario',
    `Plan: ${planName}`,
    paymentUrl ? `Enlace de pago: ${paymentUrl}` : '',
    expiresLabel ? `Válido hasta ${expiresLabel}` : '',
    '',
    `Teléfono: ${callCenterPhone}`,
    'Correo: info@lamundialdeseguros.com',
    'Web: https://lamundialdeseguros.com/',
    '',
    'Mensaje automático. No respondas a este correo.',
  ]
    .filter(Boolean)
    .join('\n');

  const vigenciaHtml = expiresLabel
    ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${MUTED};text-align:center;">Válido hasta ${escapeHtml(expiresLabel)}</p>`
    : '';

  const fallbackLinkHtml = paymentUrl
    ? `<p style="margin:16px 0 0;font-size:11px;line-height:1.55;color:#9ca3af;text-align:center;word-break:break-all;">
        Si el botón no funciona, copia este enlace:<br>
        <a href="${escapeHtml(paymentUrl)}" style="color:${BRAND_BLUE};">${escapeHtml(paymentUrl)}</a>
      </p>`
    : '';

  const ctaHtml = paymentUrl
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 0;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(paymentUrl)}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:6px;">
              Ir a pagar mi <span style="background:${HIGHLIGHT};color:${BRAND_BLUE};padding:0 3px;">póliza</span>
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
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
                Seguro <span style="color:${BRAND_BLUE};font-weight:700;">Funerario</span>
              </div>
              <h1 style="margin:18px 0 0;font-size:18px;font-weight:800;line-height:1.35;color:${BRAND_BLUE};text-transform:uppercase;">
                Estimado ${escapeHtml(estimado)}.
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 0;text-align:center;">
              <p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND_BLUE};">
                <span style="background:${HIGHLIGHT};padding:0 2px;">Tu</span> plan
                <strong>${highlightWord(planName, 'Funerario')}</strong> está listo.
                Pulsa el botón para continuar con el
                <strong><span style="background:${HIGHLIGHT};padding:0 2px;">pago</span></strong> en línea;
                tus datos ya están cargados.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;">
              <div style="border-top:1px solid #d1d5db;border-bottom:1px solid #d1d5db;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="50%" style="padding:18px 16px;text-align:center;vertical-align:top;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">Producto</div>
                      <div style="font-size:15px;font-weight:700;color:${BRAND_BLUE};"><span style="background:${HIGHLIGHT};padding:0 2px;">Funerario</span></div>
                    </td>
                    <td width="1" style="background:#d1d5db;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="50%" style="padding:18px 16px;text-align:center;vertical-align:top;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">Plan</div>
                      <div style="font-size:15px;font-weight:700;color:${BRAND_BLUE};">${highlightWord(planName, 'Funerario')}</div>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              ${ctaHtml}
              ${vigenciaHtml}
              ${fallbackLinkHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:${BRAND_BLUE};">
                Teléfono: ${escapeHtml(callCenterPhone)}<br>
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

  return { subject, html, text };
}
