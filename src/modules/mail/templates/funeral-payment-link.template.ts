/** Correo funerario: enlace de pago. No usar en RCV ni otros ramos. */

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

const BRAND_NAVY = '#0f3462';
const BRAND_RED = '#E84F51';
const BRAND_BLUE = '#2E6DBF';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function brandRibbonHtml(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td width="68%" height="4" bgcolor="${BRAND_NAVY}" style="height:4px;line-height:4px;font-size:0;background:${BRAND_NAVY};">&nbsp;</td>
              <td width="18%" height="4" bgcolor="${BRAND_BLUE}" style="height:4px;line-height:4px;font-size:0;background:${BRAND_BLUE};">&nbsp;</td>
              <td width="14%" height="4" bgcolor="${BRAND_RED}" style="height:4px;line-height:4px;font-size:0;background:${BRAND_RED};">&nbsp;</td>
            </tr>
          </table>`;
}

/** Bulletproof CTA — Gmail, Apple Mail, Outlook (VML). */
function ctaButtonHtml(url: string, label: string): string {
  const href = url.trim();
  if (!href) return '';
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" class="lm-btn-wrap" style="margin:0 auto;">
            <tr>
              <td align="center" bgcolor="${BRAND_NAVY}" class="lm-btn" style="background:${BRAND_NAVY};border-radius:4px;mso-padding-alt:0;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                  href="${escapeHtml(href)}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="8%"
                  strokecolor="${BRAND_NAVY}" fillcolor="${BRAND_NAVY}">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                    ${escapeHtml(label)}
                  </center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="lm-btn-link"
                  style="display:inline-block;min-width:260px;padding:15px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.25;color:#ffffff !important;text-decoration:none;text-align:center;box-sizing:border-box;-webkit-text-size-adjust:none;">
                  ${escapeHtml(label)}
                </a>
                <!--<![endif]-->
              </td>
            </tr>
          </table>`;
}

export function buildFuneralPaymentLinkEmail(
  params: FuneralPaymentLinkParams,
): FuneralPaymentLinkEmail {
  const callCenterPhone =
    String(params.callCenterPhone || process.env.CALL_CENTER_PHONE || '0800LaMundial').trim()
    || '0800LaMundial';
  const nombre = params.nombre.trim() || 'Cliente';
  const planName = params.planName.trim() || 'Funerario';
  const paymentUrl = params.paymentUrl.trim();
  const expiresLabel = params.expiresLabel?.trim() || '';
  const fecha = new Date().toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const subject = 'La Mundial · Completa el pago de tu póliza funerario';
  const preheader = `Plan ${planName} listo. Pulsa el botón para pagar en línea.`;

  const text = [
    'La Mundial de Seguros',
    '',
    `Estimado ${nombre}.`,
    '',
    `Tu plan ${planName} está listo. Usa el botón del correo para pagar en línea.`,
    paymentUrl ? paymentUrl : '',
    expiresLabel ? `Vigencia: ${expiresLabel}` : '',
    '',
    `La Mundial de Seguros · ${callCenterPhone}`,
  ]
    .filter(Boolean)
    .join('\n');

  const vigenciaHtml = expiresLabel
    ? `<p class="lm-muted" style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;mso-line-height-rule:exactly;">Válido hasta ${escapeHtml(expiresLabel)}.</p>`
    : `<p class="lm-muted" style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;mso-line-height-rule:exactly;">${escapeHtml(fecha)}.</p>`;

  const html = `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0; mso-table-rspace: 0; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; height: auto; line-height: 100%; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    @media only screen and (max-width: 620px) {
      .lm-shell { width: 100% !important; max-width: 100% !important; }
      .lm-pad { padding-left: 20px !important; padding-right: 20px !important; }
      .lm-title { font-size: 20px !important; line-height: 1.35 !important; }
      .lm-body { font-size: 15px !important; }
      .lm-btn-link { min-width: 0 !important; width: 100% !important; display: block !important; padding: 16px 20px !important; }
      .lm-summary-col { display: block !important; width: 100% !important; border-left: 0 !important; border-top: 1px solid #E2E8F0 !important; padding-top: 12px !important; margin-top: 8px !important; }
      .lm-summary-first { border-top: 0 !important; margin-top: 0 !important; padding-top: 4px !important; }
    }
  </style>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:0;width:100% !important;background:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">
    ${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:24px 12px 32px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" class="lm-shell" style="max-width:560px;width:100%;background:#ffffff;">
          <tr>
            <td align="center" class="lm-pad" style="padding:8px 32px 16px;">
              <img src="https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg" width="260" height="auto" alt="La Mundial de Seguros"
                style="display:block;width:50%;max-width:260px;height:auto;margin:0 auto;border:0;">
            </td>
          </tr>
          <tr>
            <td class="lm-pad" style="padding:0 32px 8px;">
              ${brandRibbonHtml()}
            </td>
          </tr>
          <tr>
            <td align="center" class="lm-pad" style="padding:28px 32px 36px;color:${BRAND_NAVY};">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND_RED};mso-line-height-rule:exactly;">Seguro funerario</p>
              <h1 class="lm-title" style="margin:0 0 24px;font-size:22px;line-height:1.35;font-weight:700;text-transform:uppercase;color:${BRAND_NAVY};mso-line-height-rule:exactly;">Estimado ${escapeHtml(nombre)}.</h1>
              <p class="lm-body" style="margin:0 auto 28px;max-width:440px;font-size:15px;line-height:1.75;color:${BRAND_NAVY};mso-line-height-rule:exactly;">
                Tu plan <strong style="font-weight:700;">${escapeHtml(planName)}</strong> está listo.
                Pulsa el botón para continuar con el pago en línea; tus datos ya están cargados.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:420px;margin:0 auto 32px;">
                <tr>
                  <td style="border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;padding:18px 4px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" valign="top" width="50%" class="lm-summary-col lm-summary-first"
                          style="font-size:12px;line-height:1.5;color:#64748b;padding:4px 10px;mso-line-height-rule:exactly;">
                          <span style="display:block;margin-bottom:6px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Producto</span>
                          <strong style="font-size:15px;color:${BRAND_NAVY};">Funerario</strong>
                        </td>
                        <td align="center" valign="top" width="50%" class="lm-summary-col"
                          style="font-size:12px;line-height:1.5;color:#64748b;padding:4px 10px;border-left:1px solid #E2E8F0;mso-line-height-rule:exactly;">
                          <span style="display:block;margin-bottom:6px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Plan</span>
                          <strong style="font-size:15px;color:${BRAND_NAVY};">${escapeHtml(planName)}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ${ctaButtonHtml(paymentUrl, 'Ir a pagar mi póliza')}
              ${vigenciaHtml}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:420px;margin:36px auto 0;">
                <tr>
                  <td style="border-top:1px solid #E2E8F0;font-size:0;line-height:0;height:1px;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:14px;line-height:1.75;color:${BRAND_NAVY};mso-line-height-rule:exactly;">
                Teléfono: ${escapeHtml(callCenterPhone)}<br>
                Correo: <a href="mailto:info@lamundialdeseguros.com" style="color:${BRAND_NAVY};text-decoration:underline;">info@lamundialdeseguros.com</a><br>
                Web: <a href="https://lamundialdeseguros.com/" style="color:${BRAND_NAVY};text-decoration:underline;">lamundialdeseguros.com</a>
              </p>
              <p style="margin:28px 0 0;font-size:18px;font-weight:700;line-height:1.3;color:${BRAND_NAVY};mso-line-height-rule:exactly;">La Mundial de Seguros</p>
              <p style="margin:12px 0 0;font-size:11px;line-height:1.5;color:#94a3b8;mso-line-height-rule:exactly;">Mensaje automático. No respondas a este correo.</p>
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
