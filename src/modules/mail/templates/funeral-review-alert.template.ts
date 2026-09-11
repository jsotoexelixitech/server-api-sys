/** Alerta a mesa técnica funerario — layout corporativo La Mundial. */

import { buildLamundialBrandedEmail, type BuiltEmail } from './lamundial-branded.template';

export type FuneralReviewAlertEmail = BuiltEmail;

export type FuneralReviewAlertParams = {
  tomadorNombre: string;
  planName: string;
  scoreTotal: string;
  callCenterPhone?: string;
};

export function buildFuneralReviewAlertEmail(
  params: FuneralReviewAlertParams,
): FuneralReviewAlertEmail {
  const tomador = params.tomadorNombre.trim() || 'Tomador';
  const planName = params.planName.trim() || 'Funerario';
  const score = params.scoreTotal.trim() || '—';

  return buildLamundialBrandedEmail({
    subject: `La Mundial · Mesa técnica funerario — ${planName}`,
    eyebrow: 'Mesa técnica · Funerario',
    title: 'Solicitud referida',
    intro:
      'Un cliente requiere autorización antes de continuar al pago. Revisa puntaje, identidad y documentos en la bandeja de mesa técnica.',
    fields: [
      { label: 'Tomador', value: tomador },
      { label: 'Plan', value: planName },
      { label: 'Puntaje', value: score },
    ],
    extraNote: 'Ábrela en Nexus → Emisión funerario → Autorización de pólizas.',
    callCenterPhone: params.callCenterPhone,
  });
}
