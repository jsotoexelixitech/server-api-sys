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

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ctaButtonHtml(url: string, label: string): string {
  const href = url.trim();
  if (!href) return '';
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 24px;">
                <tr>
                  <td align="center" bgcolor="#E84F51" style="border-radius:8px;background:#E84F51;">
                    <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
                      style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;">
                      ${escapeHtml(label)}
                    </a>
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

  const subject = 'La Mundial · Completa el pago de tu póliza funerario';

  const text = [
    'La Mundial de Seguros',
    '',
    `Hola ${nombre},`,
    '',
    `Tu plan ${planName} está listo. Abre el enlace para continuar con el pago. Tus datos ya están cargados.`,
    paymentUrl ? `Enlace: ${paymentUrl}` : '',
    expiresLabel ? `Vigencia del enlace: ${expiresLabel}` : '',
    '',
    'La Mundial de Seguros',
    callCenterPhone,
  ]
    .filter(Boolean)
    .join('\n');

  const vigenciaBlock = expiresLabel
    ? `<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#6B7280;text-align:center;">El enlace vence el ${escapeHtml(expiresLabel)}.</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F8;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#F3F4F8" style="background:#F3F4F8;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding:0 0 16px;">
              <img src="https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg" width="220" alt="La Mundial de Seguros" style="display:block;width:220px;max-width:70%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #E5E7EB;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="70%" height="4" bgcolor="#0F1A5A" style="font-size:0;line-height:0;">&nbsp;</td>
                        <td width="18%" height="4" bgcolor="#2E6DBF" style="font-size:0;line-height:0;">&nbsp;</td>
                        <td width="12%" height="4" bgcolor="#E84F51" style="font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 36px 8px;">
                    <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#E84F51;">Seguro funerario</p>
                    <h1 style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;font-weight:700;color:#0F1A5A;">Tu plan está listo para el pago</h1>
                    <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#111827;">Hola ${escapeHtml(nombre)},</p>
                    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#4B5563;">
                      El plan <strong style="color:#0F1A5A;">${escapeHtml(planName)}</strong> ya puede contratarse.
                      Pulsa el botón para pagar en línea. Tus datos van precargados.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 36px 0;">
                    ${ctaButtonHtml(paymentUrl, 'Pagar ahora')}
                    ${vigenciaBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 36px 28px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:#9CA3AF;word-break:break-all;">
                      Si el botón no abre, copia este enlace en el navegador:<br>
                      <a href="${escapeHtml(paymentUrl)}" style="color:#2E6DBF;text-decoration:underline;">${escapeHtml(paymentUrl)}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 16px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6B7280;">
              La Mundial de Seguros, C.A.<br>
              Call Center ${escapeHtml(callCenterPhone)}<br>
              <a href="https://lamundialdeseguros.com/" style="color:#2E6DBF;text-decoration:none;">lamundialdeseguros.com</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#9CA3AF;">
              Este mensaje se generó de forma automática. No respondas a este correo.
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
