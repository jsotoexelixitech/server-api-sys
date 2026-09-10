/** Port de SysIP-backend/src/templates/welcome.ejs (emisión RCV / cuota inicial). */
export function renderPolicyWelcomeHtml(params: {
  nombre: string;
  cnpoliza: string;
  polizaUrl: string;
  reciboUrl?: string;
}): string {
  const nombre = escapeHtml(params.nombre || 'Cliente');
  const cnpoliza = escapeHtml(params.cnpoliza);
  const polizaUrl = escapeAttr(params.polizaUrl);
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
          Tu póliza <strong>${cnpoliza}</strong> ha sido emitida. Adjuntamos los documentos oficiales
          y también puedes visualizarlos en los siguientes enlaces:
        </p>
        <p style="margin:0 0 24px;">
          <a style="color:white;padding:8px 12px;background-color:#0f3462;text-decoration:none;display:inline-block;margin:6px 4px;border-radius:4px;" href="${polizaUrl}">Visualizar Póliza</a>
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
