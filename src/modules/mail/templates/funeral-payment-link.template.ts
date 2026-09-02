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
  return `<table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td bgcolor="#E84F51" class="lm-cta" style="background:#E84F51;border-radius:6px;">
                          <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
                            style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;">
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
  const fecha = new Date().toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const subject = 'La Mundial · Completa el pago de tu póliza funerario';

  const text = [
    'La Mundial de Seguros',
    '',
    `Hola ${nombre},`,
    '',
    `Tu plan ${planName} está listo. Abre el enlace para continuar con el pago.`,
    paymentUrl ? `Enlace: ${paymentUrl}` : '',
    expiresLabel ? `Vigencia: ${expiresLabel}` : '',
    '',
    `La Mundial de Seguros · ${callCenterPhone}`,
  ]
    .filter(Boolean)
    .join('\n');

  const vigencia = expiresLabel
    ? `El enlace vence el ${escapeHtml(expiresLabel)}.`
    : `${escapeHtml(fecha)}.`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${escapeHtml(subject)}</title>
  <style type="text/css">
    @keyframes lm-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(232,79,81,0.35); }
      70% { box-shadow: 0 0 0 10px rgba(232,79,81,0); }
    }
    .lm-cta { animation: lm-pulse 2.4s ease-out infinite; }
  </style>
</head>
<body style="margin:0;padding:0;background:#F7F8FA;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#F7F8FA" style="background:#F7F8FA;">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="left" style="padding:0 0 20px;">
              <img src="https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg" width="168" alt="La Mundial de Seguros" style="display:block;width:168px;max-width:55%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #E6E8EE;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="72%" height="4" bgcolor="#0F1A5A" style="font-size:0;line-height:0;">&nbsp;</td>
                        <td width="16%" height="4" bgcolor="#2E6DBF" style="font-size:0;line-height:0;">&nbsp;</td>
                        <td width="12%" height="4" bgcolor="#E84F51" style="font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 36px 8px;">
                    <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#E84F51;">Seguro funerario</p>
                    <h1 style="margin:0 0 20px;font-family:Georgia,Times New Roman,serif;font-size:28px;line-height:1.25;font-weight:700;color:#0F1A5A;">Completa el pago<br>de tu póliza</h1>
                    <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#111827;">Hola ${escapeHtml(nombre)},</p>
                    <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#4B5563;">
                      Ya preparamos tu contratación. El plan
                      <strong style="color:#0F1A5A;">${escapeHtml(planName)}</strong>
                      está listo: entra y paga en línea, con tus datos cargados.
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
                      <tr>
                        <td style="border-top:1px solid #E6E8EE;border-bottom:1px solid #E6E8EE;padding:16px 0;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td width="50%" valign="top" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;padding-right:12px;">
                                Producto<br>
                                <span style="display:inline-block;margin-top:4px;font-size:15px;font-weight:700;color:#0F1A5A;">Funerario</span>
                              </td>
                              <td width="50%" valign="top" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;">
                                ${expiresLabel ? 'Vigencia del enlace' : 'Fecha'}<br>
                                <span style="display:inline-block;margin-top:4px;font-size:15px;font-weight:700;color:#0F1A5A;">${expiresLabel ? escapeHtml(expiresLabel) : escapeHtml(fecha)}</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    ${ctaButtonHtml(paymentUrl, 'Ir a pagar mi póliza')}
                    <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9CA3AF;">
                      ${vigencia}<br>
                      Si el botón no abre, usa este enlace:<br>
                      <a href="${escapeHtml(paymentUrl)}" style="color:#2E6DBF;text-decoration:underline;word-break:break-all;">${escapeHtml(paymentUrl)}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 36px 28px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6B7280;">
                      La Mundial de Seguros, C.A. · ${escapeHtml(callCenterPhone)}<br>
                      <a href="https://lamundialdeseguros.com/" style="color:#2E6DBF;text-decoration:none;">lamundialdeseguros.com</a>
                    </p>
                  </td>
                </tr>
              </table>
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
