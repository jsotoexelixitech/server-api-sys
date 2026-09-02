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
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="center" bgcolor="#E84F51" class="lm-cta" style="background:#E84F51;border-radius:28px;">
                                <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"
                                  style="display:block;padding:16px 22px;font-family:Georgia,Times New Roman,serif;font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;text-align:center;letter-spacing:0.04em;">
                                  ${escapeHtml(label)} →
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
    month: 'short',
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

  const vigenciaLine = expiresLabel
    ? `Válido hasta ${escapeHtml(expiresLabel)}`
    : `Emitido ${escapeHtml(fecha)}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${escapeHtml(subject)}</title>
  <style type="text/css">
    @keyframes lm-fade {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: none; }
    }
    @keyframes lm-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(232,79,81,0.55); }
      70% { box-shadow: 0 0 0 16px rgba(232,79,81,0); }
    }
    @keyframes lm-sheen {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }
    .lm-pass { animation: lm-fade 0.75s ease-out; box-shadow: 0 18px 40px rgba(15,26,90,0.10); }
    .lm-cta { animation: lm-pulse 2.1s ease-out infinite; }
    .lm-sheen {
      background-image: linear-gradient(90deg,#0F1A5A 0%,#2E6DBF 35%,#E84F51 68%,#0F1A5A 100%);
      background-size: 200% 100%;
      animation: lm-sheen 5s linear infinite;
    }
    @media only screen and (max-width: 620px) {
      .lm-stub, .lm-main { display: block !important; width: 100% !important; }
      .lm-stub { border-bottom: 1px dashed #3A4A8A !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F4F6FB;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#F4F6FB" style="background:#F4F6FB;">
    <tr>
      <td align="center" style="padding:28px 12px 36px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" class="lm-pass" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding:4px 0 18px;">
              <p style="margin:0 0 10px;font-family:Georgia,Times New Roman,serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#6B7280;">Pase digital · pago</p>
              <img src="https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg" width="200" alt="La Mundial de Seguros" style="display:block;width:200px;max-width:64%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;">
                <tr>
                  <td class="lm-sheen" height="6" bgcolor="#0F1A5A" style="font-size:0;line-height:0;background:#0F1A5A;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#0F1A5A" style="background:#0F1A5A;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="lm-stub" width="118" valign="middle" bgcolor="#0F1A5A" style="width:118px;padding:28px 12px;text-align:center;border-right:1px dashed #3A4A8A;">
                    <p style="margin:0 0 6px;font-family:Georgia,Times New Roman,serif;font-size:10px;letter-spacing:0.2em;color:#8AA0C8;">LM</p>
                    <p style="margin:0 0 14px;font-family:Georgia,Times New Roman,serif;font-size:28px;line-height:1;font-weight:700;color:#ffffff;">01</p>
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#E84F51;">Funerario</p>
                  </td>
                  <td class="lm-main" valign="top" bgcolor="#0F1A5A" style="padding:26px 26px 22px;">
                    <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#E84F51;">Seguro funerario</p>
                    <h1 style="margin:0 0 14px;font-family:Georgia,Times New Roman,serif;font-size:26px;line-height:1.2;font-weight:700;color:#ffffff;">Tu cobertura espera un último paso</h1>
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#C5D0EA;">Hola <strong style="color:#ffffff;">${escapeHtml(nombre)}</strong>. El plan ya está armado. Solo falta el pago para activarlo.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#0F1A5A" style="background:#0F1A5A;padding:0 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="14" height="14" bgcolor="#F4F6FB" style="width:14px;height:14px;background:#F4F6FB;border-radius:14px;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="border-bottom:1px dashed #3A4A8A;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="14" height="14" bgcolor="#F4F6FB" style="width:14px;height:14px;background:#F4F6FB;border-radius:14px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:22px 26px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:0 0 16px;">
                    <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6B7280;">Plan</p>
                    <p style="margin:0;font-family:Georgia,Times New Roman,serif;font-size:20px;line-height:1.3;color:#0F1A5A;">${escapeHtml(planName)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F6FB;border-left:3px solid #E84F51;">
                      <tr>
                        <td width="50%" style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;">Producto<br><strong style="color:#0F1A5A;font-size:14px;">Funerario</strong></td>
                        <td width="50%" style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;text-align:right;">${expiresLabel ? 'Vigencia' : 'Fecha'}<br><strong style="color:#0F1A5A;font-size:14px;">${expiresLabel ? escapeHtml(expiresLabel) : escapeHtml(fecha)}</strong></td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px;">
                    ${ctaButtonHtml(paymentUrl, 'Ir a pagar mi póliza')}
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.55;color:#9CA3AF;word-break:break-all;">
                      ${vigenciaLine}<br>
                      Si el botón no abre: <a href="${escapeHtml(paymentUrl)}" style="color:#2E6DBF;text-decoration:underline;">${escapeHtml(paymentUrl)}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#FFFFFF" style="background:#FFFFFF;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="68%" height="4" bgcolor="#0F1A5A" style="font-size:0;line-height:0;">&nbsp;</td>
                  <td width="18%" height="4" bgcolor="#2E6DBF" style="font-size:0;line-height:0;">&nbsp;</td>
                  <td width="14%" height="4" bgcolor="#E84F51" style="font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 16px 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#6B7280;">
              La Mundial de Seguros, C.A. · Call Center ${escapeHtml(callCenterPhone)}<br>
              <a href="https://lamundialdeseguros.com/" style="color:#2E6DBF;text-decoration:none;">lamundialdeseguros.com</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:2px 16px 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9CA3AF;">
              Mensaje automático. No respondas a este correo.
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
