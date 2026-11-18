/** Póliza emitida junto a la principal (p. ej. el RCV que sale aparte en Auto Casco). */
export type PolizaAdicionalCorreo = { cnpoliza: string; producto?: string; url?: string };

const BOTON_STYLE =
  'color:white;padding:8px 12px;background-color:#0f3462;text-decoration:none;display:inline-block;margin:6px 4px;border-radius:4px;';

/** Asunto del correo de bienvenida: con una sola póliza es el de siempre. */
export function asuntoBienvenida(cnpoliza: string, otras: PolizaAdicionalCorreo[] = []): string {
  if (!otras.length) return `Bienvenido a La Mundial de Seguros — Póliza ${cnpoliza}`;
  return `Bienvenido a La Mundial de Seguros — Pólizas ${unirConY([cnpoliza, ...otras.map((p) => p.cnpoliza)])}`;
}

function unirConY(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * Port de SysIP-backend/src/templates/welcome.ejs (emisión RCV / cuota inicial).
 * Sin `otrasPolizas` el HTML es exactamente el de siempre; con ellas el texto nombra todas las pólizas
 * (número y producto si viene) y agrega un botón «Visualizar Póliza <número>» por cada una con URL.
 */
export function renderPolicyWelcomeHtml(params: {
  nombre: string;
  cnpoliza: string;
  polizaUrl: string;
  reciboUrl?: string;
  producto?: string;
  otrasPolizas?: PolizaAdicionalCorreo[];
}): string {
  const nombre = escapeHtml(params.nombre || 'Cliente');
  const cnpoliza = escapeHtml(params.cnpoliza);
  const polizaUrl = escapeAttr(params.polizaUrl);
  const otras = (params.otrasPolizas ?? []).filter((p) => String(p?.cnpoliza ?? '').trim());
  const etiqueta = (cn: string, producto?: string) =>
    `<strong>${escapeHtml(cn)}</strong>${producto?.trim() ? ` (${escapeHtml(producto.trim())})` : ''}`;
  const frasePolizas = otras.length
    ? `Tus pólizas ${unirConY([etiqueta(params.cnpoliza, params.producto), ...otras.map((p) => etiqueta(p.cnpoliza, p.producto))])} han sido emitidas.`
    : `Tu póliza <strong>${cnpoliza}</strong> ha sido emitida.`;
  const textoBoton = otras.length ? `Visualizar Póliza ${cnpoliza}` : 'Visualizar Póliza';
  const otrosBotones = otras
    .filter((p) => p.url)
    .map(
      (p) =>
        `\n          <a style="${BOTON_STYLE}" href="${escapeAttr(p.url!)}">Visualizar Póliza ${escapeHtml(p.cnpoliza)}</a>`,
    )
    .join('');
  const reciboBlock = params.reciboUrl
    ? `<a style="color:white;padding:8px 12px;background-color:#0f3462;text-decoration:none;display:inline-block;margin:6px 4px;border-radius:4px;" href="${escapeAttr(params.reciboUrl)}">Visualizar Recibo</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>La Mundial de Seguros</title>
</head>
<body bgcolor="#0f3462" style="margin:20px 0;font-family:sans-serif;">
  <table border="0" align="center" cellspacing="0" cellpadding="0" bgcolor="white" width="560">
    <tr><td style="padding:24px;">
      <div style="text-align:center;">
        <img style="width:50%;max-width:260px;" src="https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg" alt="La Mundial de Seguros">
      </div>
      <div style="text-align:center;padding-top:32px;color:#0f3462;">
        <h1 style="margin:0 0 20px;text-transform:uppercase;font-size:22px;">Estimado ${nombre}.</h1>
        <p style="margin:0 24px 24px;line-height:1.7;font-size:15px;text-align:left;">
          En nombre de todo el equipo de La Mundial de Seguros, queremos darte la más cordial bienvenida.
          Nos sentimos muy felices de que hayas elegido proteger tu futuro con nosotros.
        </p>
        <p style="margin:0 24px 24px;line-height:1.7;font-size:15px;text-align:left;">
          ${frasePolizas} Adjuntamos los documentos oficiales
          y también puedes visualizarlos en los siguientes enlaces:
        </p>
        <p style="margin:0 0 24px;">
          <a style="color:white;padding:8px 12px;background-color:#0f3462;text-decoration:none;display:inline-block;margin:6px 4px;border-radius:4px;" href="${polizaUrl}">${textoBoton}</a>${otrosBotones}
          ${reciboBlock}
        </p>
        <p style="margin:0 24px;line-height:1.7;font-size:14px;text-align:left;">
          Teléfono: +58 (424) 2031351<br>
          Correo: info@lamundialdeseguros.com<br>
          Web: https://lamundialdeseguros.com/
        </p>
        <h2 style="margin:24px 0 0;font-size:18px;">La Mundial de Seguros</h2>
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
