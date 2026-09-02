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

/** Botón compatible con Gmail, Outlook y Apple Mail (sin enlace visible de respaldo). */
function ctaButtonHtml(url: string, label: string): string {
  const href = url.trim();
  if (!href) return '';
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
            <tr>
              <td align="center" bgcolor="#0f3462" style="background:#0f3462;border-radius:4px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                  href="${escapeHtml(href)}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="8%"
                  strokecolor="#0f3462" fillcolor="#0f3462">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                    ${escapeHtml(label)}
                  </center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
                  style="display:inline-block;min-width:220px;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;text-align:center;box-sizing:border-box;">
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
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Válido hasta ${escapeHtml(expiresLabel)}.</p>`
    : `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">${escapeHtml(fecha)}.</p>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:20px 0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="560" align="center" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="max-width:560px;width:100%;background:#ffffff;">
    <tr>
      <td align="center" style="padding:24px 24px 12px;">
        <img src="https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg" width="260" alt="La Mundial de Seguros" style="display:block;width:50%;max-width:260px;height:auto;border:0;">
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:20px 32px 32px;color:#0f3462;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#E84F51;">Seguro funerario</p>
        <h1 style="margin:0 0 24px;font-size:22px;line-height:1.35;font-weight:700;text-transform:uppercase;color:#0f3462;">Estimado ${escapeHtml(nombre)}.</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#0f3462;max-width:440px;">
          Tu plan <strong>${escapeHtml(planName)}</strong> está listo.
          Pulsa el botón para continuar con el pago en línea; tus datos ya están cargados.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:400px;margin:0 auto 28px;">
          <tr>
            <td style="border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;padding:16px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" width="50%" style="font-size:12px;color:#64748b;padding:4px 8px;">
                    Producto<br>
                    <strong style="font-size:14px;color:#0f3462;">Funerario</strong>
                  </td>
                  <td align="center" width="50%" style="font-size:12px;color:#64748b;padding:4px 8px;border-left:1px solid #E2E8F0;">
                    Plan<br>
                    <strong style="font-size:14px;color:#0f3462;">${escapeHtml(planName)}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        ${ctaButtonHtml(paymentUrl, 'Ir a pagar mi póliza')}
        ${vigenciaHtml}
        <p style="margin:32px 0 0;font-size:14px;line-height:1.75;color:#0f3462;">
          Teléfono: ${escapeHtml(callCenterPhone)}<br>
          Correo: info@lamundialdeseguros.com<br>
          Web: <a href="https://lamundialdeseguros.com/" style="color:#0f3462;text-decoration:underline;">lamundialdeseguros.com</a>
        </p>
        <h2 style="margin:24px 0 0;font-size:18px;font-weight:700;color:#0f3462;">La Mundial de Seguros</h2>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
