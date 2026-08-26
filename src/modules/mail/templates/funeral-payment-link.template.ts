export function renderFuneralPaymentLinkHtml(params: {
  nombre: string;
  planName: string;
  paymentUrl: string;
  expiresLabel?: string;
}): string {
  const { nombre, planName, paymentUrl, expiresLabel } = params;
  const vigencia = expiresLabel
    ? `<p style="color:#64748b;font-size:14px;margin:16px 0 0">Este enlace estará disponible hasta <strong>${expiresLabel}</strong>.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08)">
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">
          <p style="margin:0;color:rgba(255,255,255,.85);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Seguro funerario</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:800">Completa el pago de tu póliza</h1>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 16px;color:#0f172a;font-size:16px;line-height:1.6">Hola <strong>${nombre}</strong>,</p>
          <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6">
            Tu póliza <strong>${planName}</strong> está lista para contratarse. Usa el botón para ingresar al pago seguro en línea.
            Tus datos ya están precargados en el formulario.
          </p>
          <p style="margin:24px 0;text-align:center">
            <a href="${paymentUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px">Ir a pagar mi póliza</a>
          </p>
          ${vigencia}
          <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.5">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all;color:#64748b">${paymentUrl}</span></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
