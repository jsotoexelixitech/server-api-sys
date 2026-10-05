/** Rechazo funerario al tomador — mismo layout corporativo La Mundial. */

import { buildLamundialBrandedEmail, type BuiltEmail } from './lamundial-branded.template';

export type FuneralRejectedEmail = BuiltEmail;

export type FuneralRejectedParams = {
  tomadorNombre: string;
  planName: string;
  /** Producto real; vacío = Funerario. */
  productLabel?: string;
  reason?: string;
  callCenterPhone?: string;
};

export function buildFuneralRejectedEmail(
  params: FuneralRejectedParams,
): FuneralRejectedEmail {
  const tomador = params.tomadorNombre.trim() || 'Cliente';
  const planName = params.planName.trim() || 'Funerario';
  const producto = params.productLabel?.trim() || 'Funerario';
  const esFunerario = producto.toLowerCase() === 'funerario';
  const reason = params.reason?.trim() || '';

  return buildLamundialBrandedEmail({
    subject: `La Mundial · Solicitud ${producto.toLowerCase()} no aprobada — ${planName}`,
    eyebrow: `Seguro ${producto}`,
    title: `Estimado ${tomador.toUpperCase()}.`,
    intro:
      `Tu solicitud de póliza ${esFunerario ? 'funeraria' : `de ${producto.toLowerCase()}`} no pudo aprobarse en línea. Comunícate con tu asesor de ventas para revisar el caso y las opciones disponibles.`,
    fields: [
      { label: 'Plan', value: planName },
      ...(reason ? [{ label: 'Motivo', value: reason }] : []),
    ],
    extraNote:
      'Si no tienes los datos de tu asesor, llama al centro de atención o escribe a info@lamundialdeseguros.com.',
    callCenterPhone: params.callCenterPhone,
  });
}
