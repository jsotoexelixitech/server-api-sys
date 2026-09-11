/** Alerta a mesa técnica funerario — mismo layout corporativo que el mail de pago. */

export type FuneralReviewAlertEmail = {
  subject: string;
  html: string;
  text: string;
};

export type FuneralReviewAlertParams = {
  tomadorNombre: string;
  planName: string;
  scoreTotal: string;
  callCenterPhone?: string;
};

const LOGO_URL =
  'https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg';
const BRAND_BLUE = '#0f3462';
const BRAND_RED = '#c8102e';
const MUTED = '#6b7280';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFuneralReviewAlertEmail(
  params: FuneralReviewAlertParams,
): FuneralReviewAlertEmail {
  const callCenterPhone =
    String(params.callCenterPhone || process.env.CALL_CENTER_PHONE || '0800LaMundial').trim() ||
    '0800LaMundial';
  const tomador = params.tomadorNombre.trim() || 'Tomador';
  const planName = params.planName.trim() || 'Funerario';
  const score = params.scoreTotal.trim() || '—';

  const subject = `La Mundial · Mesa técnica funerario — ${planName}`;

  const text = [
    'La Mundial de Seguros',
    '',
    'Mesa técnica · Seguro funerario',
    '',
    'Hay una solicitud referida que requiere autorización antes de continuar al pago.',
    '',
    `Tomador: ${tomador}`,
    `Plan: ${planName}`,
    `Puntaje: ${score}`,
    '',
    'Ábrela en Nexus → Emisión funerario → Autorización de pólizas.',
    '',
    `Teléfono: ${callCenterPhone}`,
    'Correo: info@lamundialdeseguros.com',
    'Web: https://lamundialdeseguros.com/',
    '',
    'Mensaje automático. No respondas a este correo.',
  ].join('\n');

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
                Mesa técnica · <span style="color:${BRAND_BLUE};font-weight:700;">Funerario</span>
              </div>
              <h1 style="margin:18px 0 0;font-size:18px;font-weight:800;line-height:1.35;color:${BRAND_BLUE};text-transform:uppercase;">
                Solicitud referida
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 0;text-align:center;">
              <p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND_BLUE};">
                Un cliente requiere <strong>autorización</strong> antes de continuar al pago.
                Revisa puntaje, identidad y documentos en la bandeja de mesa técnica.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;">
              <div style="border-top:1px solid #d1d5db;border-bottom:1px solid #d1d5db;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="34%" style="padding:18px 10px;text-align:center;vertical-align:top;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">Tomador</div>
                      <div style="font-size:14px;font-weight:700;color:${BRAND_BLUE};">${escapeHtml(tomador)}</div>
                    </td>
                    <td width="1" style="background:#d1d5db;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="33%" style="padding:18px 10px;text-align:center;vertical-align:top;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">Plan</div>
                      <div style="font-size:14px;font-weight:700;color:${BRAND_BLUE};">${escapeHtml(planName)}</div>
                    </td>
                    <td width="1" style="background:#d1d5db;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="33%" style="padding:18px 10px;text-align:center;vertical-align:top;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">Puntaje</div>
                      <div style="font-size:14px;font-weight:700;color:${BRAND_BLUE};">${escapeHtml(score)}</div>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 8px;text-align:center;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">
                Ábrela en Nexus → Emisión funerario → Autorización de pólizas.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;text-align:center;">
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
