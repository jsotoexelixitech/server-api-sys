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

function summaryRow(label: string, value: string, last = false): string {
  const border = last ? '' : 'border-bottom:1px solid #E6EAF2;';
  return `<tr>
                        <td style="padding:11px 0;${border}font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;width:38%;">${escapeHtml(label)}</td>
                        <td style="padding:11px 0;${border}font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0F1A5A;text-align:right;">${escapeHtml(value)}</td>
                      </tr>`;
}

function ctaButtonHtml(url: string, label: string): string {
  const href = url.trim();
  if (!href) return '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
                      <tr>
                        <td align="center" bgcolor="#E84F51" style="background:#E84F51;border-radius:8px;">
                          <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
                            style="display:block;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;text-align:center;">
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

  const subject = 'La Mundial · Completa el pago de tu póliza funerario';

  const text = [
    'La Mundial de Seguros',
    '',
    `Hola ${nombre},`,
    '',
    `Tu plan ${planName} está listo. Abre el enlace para continuar con el pago. Tus datos ya están cargados.`,
    `Producto: Funerario`,
    `Plan: ${planName}`,
    `Fecha: ${fecha}`,
    paymentUrl ? `Enlace: ${paymentUrl}` : '',
    expiresLabel ? `Vigencia del enlace: ${expiresLabel}` : '',
    '',
    `La Mundial de Seguros · ${callCenterPhone}`,
  ]
    .filter(Boolean)
    .join('\n');

  const rows = [
    summaryRow('Producto', 'Funerario'),
    summaryRow('Plan', planName, !expiresLabel),
    expiresLabel
      ? summaryRow('Vigencia del enlace', expiresLabel, true)
      : summaryRow('Fecha', fecha, true),
  ].join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#E8ECF4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#E8ECF4" style="background:#E8ECF4;">
    <tr>
      <td align="center" style="padding:24px 12px 32px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding:8px 0 18px;">
              <img src="https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg" width="200" alt="La Mundial de Seguros" style="display:block;width:200px;max-width:64%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #D5DCE8;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="68%" height="5" bgcolor="#0F1A5A" style="font-size:0;line-height:0;">&nbsp;</td>
                        <td width="18%" height="5" bgcolor="#2E6DBF" style="font-size:0;line-height:0;">&nbsp;</td>
                        <td width="14%" height="5" bgcolor="#E84F51" style="font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td bgcolor="#0F1A5A" style="background:#0F1A5A;padding:26px 32px 24px;">
                    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#E84F51;">Seguro funerario</p>
                    <h1 style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.25;font-weight:700;color:#ffffff;">Completa el pago de tu póliza</h1>
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#C5D0EA;">Un paso más para activar tu cobertura con La Mundial.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 32px 8px;">
                    <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111827;">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
                    <p style="margin:0 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#4B5563;">
                      Tu plan <strong style="color:#0F1A5A;">${escapeHtml(planName)}</strong> está listo.
                      Entra al pago seguro: tus datos ya están precargados.
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                      <tr>
                        <td style="background:#F6F8FC;border:1px solid #E1E6F0;border-left:4px solid #0F1A5A;padding:6px 18px 8px;">
                          <p style="margin:12px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6B7280;">Resumen</p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            ${rows}
                          </table>
                        </td>
                      </tr>
                    </table>
                    ${ctaButtonHtml(paymentUrl, 'Ir a pagar mi póliza')}
                    <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:#9CA3AF;word-break:break-all;">
                      Si el botón no abre, copia este enlace:<br>
                      <a href="${escapeHtml(paymentUrl)}" style="color:#2E6DBF;text-decoration:underline;">${escapeHtml(paymentUrl)}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 16px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#6B7280;">
              La Mundial de Seguros, C.A.<br>
              Call Center ${escapeHtml(callCenterPhone)}<br>
              <a href="https://lamundialdeseguros.com/" style="color:#2E6DBF;text-decoration:none;">lamundialdeseguros.com</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:4px 16px 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#9CA3AF;">
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
