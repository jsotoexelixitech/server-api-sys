/**
 * Código de verificación del portal del asegurado (Nexus, acceso por cédula). De usted,
 * solo el código y su vigencia: ni pólizas ni documentos. Misma marca que
 * `expediente-documentos` (logo, colores, pie). Tablas y estilos en línea, máx. 600 px.
 */
import { escapeHtml, type BuiltEmail } from './lamundial-branded.template';

export type ExpedienteCodigoParams = {
  subject?: string;
  nombre?: string;
  codigo: string;
  minutos?: number;
  callCenterPhone?: string;
};

const LOGO_URL =
  'https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg';
const BRAND_BLUE = '#0f3462';
const BRAND_RED = '#c8102e';
const MUTED = '#6b7280';
const TEXT = '#1f2937';
const FONT = 'Arial,Helvetica,sans-serif';
const MARCA = 'La Mundial de Seguros';
export const ASUNTO_CODIGO = `${MARCA} | Código de verificación`;

function corto(v: unknown, max: number): string {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Solo 4 a 8 dígitos: nunca texto libre en el recuadro del código. */
export function codigoSeguro(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s/g, '');
  return /^\d{4,8}$/.test(s) ? s : '';
}

export function buildExpedienteCodigoEmail(params: ExpedienteCodigoParams): BuiltEmail {
  const codigo = codigoSeguro(params.codigo);
  const minutos =
    Number.isInteger(params.minutos) && Number(params.minutos) > 0 && Number(params.minutos) <= 120
      ? Number(params.minutos)
      : 10;
  const subject = corto(params.subject, 200) || ASUNTO_CODIGO;
  const nombre = corto(params.nombre, 80);
  const phone = String(params.callCenterPhone || process.env.CALL_CENTER_PHONE || '0800LaMundial').trim();
  const saludo = `Estimado(a) ${nombre || 'asegurado(a)'}:`;
  const intro =
    'Recibimos una solicitud para ingresar a su expediente con su documento de identidad. ' +
    'Para continuar, escriba este código de verificación:';
  const vigencia = `El código vence en ${minutos} minutos y solo puede usarse una vez.`;
  const aviso =
    'Si usted no solicitó este código, ignore este mensaje: nadie podrá ingresar sin él. ' +
    `${MARCA} nunca le pedirá este código por teléfono.`;
  const pie =
    'Este es un mensaje automático generado por nuestro sistema de control documental. No requiere responder a este correo.';

  const text = [
    saludo,
    `Reciba un cordial saludo de ${MARCA}.`,
    intro,
    codigo,
    vigencia,
    aviso,
    `Atentamente,\n${MARCA}`,
    `Teléfono: ${phone}\nCorreo: info@lamundialdeseguros.com\nWeb: https://lamundialdeseguros.com/`,
    pie,
  ].join('\n\n');

  const p = (t: string) =>
    `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:23px;color:${TEXT};">${t}</p>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .px { padding-left: 18px !important; padding-right: 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;">Su código de verificación de ${MARCA}.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f6" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:20px 8px;">
        <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;">
          <tr>
            <td class="px" style="padding:24px 32px 14px;text-align:center;">
              <img src="${LOGO_URL}" alt="La Mundial de Seguros" width="200" style="width:200px;max-width:70%;height:auto;border:0;display:inline-block;">
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="height:3px;background:${BRAND_BLUE};font-size:0;line-height:0;">&nbsp;</td>
                  <td style="width:36px;height:3px;background:#cbd5e1;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="width:36px;height:3px;background:${BRAND_RED};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 32px 0;">
              <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:24px;color:${TEXT};">${escapeHtml(saludo)}</p>
              ${p(`Reciba un cordial saludo de <strong style="color:${BRAND_BLUE};">${MARCA}</strong>.`)}
              ${p(escapeHtml(intro))}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px;">
                <tr>
                  <td align="center" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:18px 12px;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:38px;font-weight:700;letter-spacing:8px;color:${BRAND_BLUE};">${escapeHtml(codigo)}</td>
                </tr>
              </table>
              ${p(`<strong style="color:${BRAND_BLUE};">${escapeHtml(vigencia)}</strong>`)}
              ${p(escapeHtml(aviso))}
              <p style="margin:18px 0 0;font-family:${FONT};font-size:15px;line-height:23px;color:${TEXT};">Atentamente,<br><strong style="color:${BRAND_BLUE};">${MARCA}</strong></p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 32px 0;">
              <div style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:12px 32px 26px;text-align:center;">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND_BLUE};">
                Teléfono: ${escapeHtml(phone)}<br>
                Correo: <a href="mailto:info@lamundialdeseguros.com" style="color:${BRAND_BLUE};">info@lamundialdeseguros.com</a><br>
                Web: <a href="https://lamundialdeseguros.com/" style="color:${BRAND_BLUE};">lamundialdeseguros.com</a>
              </p>
              <p style="margin:0;font-family:${FONT};font-size:11px;line-height:16px;color:${MUTED};">${escapeHtml(pie)}</p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
