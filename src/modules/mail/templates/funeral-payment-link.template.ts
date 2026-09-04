/** Plantilla funerario: layout de `aprobacion-tecnica.js` (solo cascarón visual + CTA). */

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
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
                <tr>
                  <td align="center" style="padding:4px 0 8px;">
                    <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
                      style="display:inline-block;background:#05c6df;color:#0c133a;text-decoration:none;font-weight:800;font-size:15px;padding:14px 28px;border-radius:14px;">
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
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `La Mundial · Completa el pago de tu póliza funerario`;

  const text = [
    'La Mundial de Seguros',
    '',
    `Hola ${nombre},`,
    '',
    `Tu plan ${planName} está listo para contratarse. Usa el enlace para continuar con el pago.`,
    paymentUrl ? `Enlace: ${paymentUrl}` : '',
    expiresLabel ? `Vigencia del enlace: ${expiresLabel}` : '',
    '',
    'Equipo La Mundial de Seguros',
  ]
    .filter(Boolean)
    .join('\n');

  const vigenciaBlock = expiresLabel
    ? `<div style="font-size:13px;margin-top:8px;line-height:1.55;opacity:0.92;">Este enlace estará disponible hasta <strong>${escapeHtml(expiresLabel)}</strong>.</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef3fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c133a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(8,38,92,0.12);">
          <tr>
            <td style="background:linear-gradient(135deg,#0c133a 0%,#08265c 55%,#05c6df 100%);padding:28px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <img src="https://lmportal.lamundialdeseguros.com/lamundialcms/dist/img/logo.png" height="40" alt="La Mundial" style="display:block;margin-bottom:12px;border:0;">
                    <div style="font-size:26px;font-weight:800;color:#ffffff;margin-top:6px;line-height:1.2;">Completa el pago de tu póliza</div>
                    <div style="font-size:14px;color:#d9e8ff;margin-top:8px;line-height:1.5;">Seguro funerario · La Mundial de Seguros</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 12px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#4a5f7a;">
                Tu plan <strong style="color:#08265c;">${escapeHtml(planName)}</strong>
                está listo. Usa el botón para ingresar al pago seguro. Tus datos ya están precargados.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;">
                <tr>
                  <td style="border:1px solid #dbe7f3;border-radius:18px;padding:18px 20px;background:#fbfdff;">
                    <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Resumen</div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:8px 0;font-size:14px;color:#64748b;width:42%;">Producto</td>
                        <td style="padding:8px 0;font-size:14px;font-weight:700;color:#08265c;">Funerario</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;font-size:14px;color:#64748b;">Plan</td>
                        <td style="padding:8px 0;font-size:14px;font-weight:700;color:#0c133a;">${escapeHtml(planName)}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;font-size:14px;color:#64748b;">Fecha</td>
                        <td style="padding:8px 0;font-size:14px;color:#0c133a;">${escapeHtml(fecha)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:16px;background:#08265c;padding:16px 18px;color:#ffffff;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Siguiente paso</div>
                    <div style="font-size:15px;font-weight:700;margin-top:6px;line-height:1.5;">Pagar en línea</div>
                    <div style="font-size:13px;margin-top:8px;line-height:1.55;opacity:0.92;">El enlace abre el módulo de pagos con tus datos precargados.</div>
                    ${vigenciaBlock}
                  </td>
                </tr>
              </table>
              ${ctaButtonHtml(paymentUrl, 'Ir a pagar mi póliza')}
              <p style="margin:12px 0 0;font-size:12px;line-height:1.55;color:#8aa0bd;word-break:break-all;">
                Si el botón no funciona, copia este enlace:<br>${escapeHtml(paymentUrl)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="border-top:1px solid #e7eef8;padding-top:18px;font-size:12px;line-height:1.6;color:#8aa0bd;text-align:center;">
                La Mundial de Seguros<br>
                Call Center: ${escapeHtml(callCenterPhone)} · 0800LaMundial<br>
                Este correo fue generado automáticamente. No respondas a este mensaje.
              </div>
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
