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
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
            <tr>
              <td bgcolor="#0f3462" style="background:#0f3462;">
                <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
                  style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;">
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
    `Estimado ${nombre}.`,
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
    : `Fecha: ${escapeHtml(fecha)}.`;

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
      <td align="center" style="padding:24px 24px 8px;background:#ffffff;">
        <img src="https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg" width="260" alt="La Mundial de Seguros" style="display:block;width:50%;max-width:260px;height:auto;border:0;">
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:28px 28px 0;color:#0f3462;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#E84F51;">Seguro funerario</p>
        <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;text-transform:uppercase;color:#0f3462;">Estimado ${escapeHtml(nombre)}.</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#0f3462;">
          Ya preparamos tu contratación. El plan <strong>${escapeHtml(planName)}</strong>
          está listo: entra y paga en línea, con tus datos cargados.
        </p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#0f3462;">
          Producto: <strong>Funerario</strong>
        </p>
        <p style="margin:0 0 28px;font-size:14px;line-height:1.7;color:#0f3462;">
          ${expiresLabel ? `Vigencia del enlace: <strong>${escapeHtml(expiresLabel)}</strong>` : `Fecha: <strong>${escapeHtml(fecha)}</strong>`}
        </p>
        ${ctaButtonHtml(paymentUrl, 'Ir a pagar mi póliza')}
        <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#0f3462;">
          ${vigencia}<br>
          Si el botón no abre, copia este enlace:<br>
          <a href="${escapeHtml(paymentUrl)}" style="color:#0f3462;word-break:break-all;">${escapeHtml(paymentUrl)}</a>
        </p>
        <p style="margin:28px 0 0;font-size:14px;line-height:1.7;color:#0f3462;">
          Teléfono: ${escapeHtml(callCenterPhone)}<br>
          Correo: info@lamundialdeseguros.com<br>
          Web: <a href="https://lamundialdeseguros.com/" style="color:#0f3462;">https://lamundialdeseguros.com/</a>
        </p>
        <h2 style="margin:24px 0 8px;font-size:18px;font-weight:700;color:#0f3462;">La Mundial de Seguros</h2>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
