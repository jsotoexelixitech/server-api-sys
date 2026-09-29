/** Plantilla funerario — layout corporativo La Mundial (marca oficial). */

import { buildLamundialBrandedEmail, type BuiltEmail } from './lamundial-branded.template';

export type FuneralPaymentLinkEmail = BuiltEmail;

export type FuneralPaymentLinkParams = {
  nombre: string;
  planName: string;
  /** Producto real; vacío = Funerario. */
  productLabel?: string;
  paymentUrl: string;
  expiresLabel?: string;
  callCenterPhone?: string;
};

function formatEstimado(nombre: string): string {
  return nombre.trim().toUpperCase() || 'CLIENTE';
}

export function buildFuneralPaymentLinkEmail(
  params: FuneralPaymentLinkParams,
): FuneralPaymentLinkEmail {
  const nombre = params.nombre.trim() || 'Cliente';
  const planName = params.planName.trim() || 'Funerario Individual';
  const producto = params.productLabel?.trim() || 'Funerario';
  const paymentUrl = params.paymentUrl.trim();
  const expiresLabel = params.expiresLabel?.trim() || '';

  return buildLamundialBrandedEmail({
    subject: `La Mundial · Pago de póliza ${producto.toLowerCase()} — ${planName}`,
    eyebrow: `Seguro ${producto}`,
    title: `Estimado ${formatEstimado(nombre)}.`,
    intro: `Tu plan ${planName} está listo. Pulsa el botón para continuar con el pago en línea; tus datos ya están cargados.`,
    fields: [
      { label: 'Producto', value: producto },
      { label: 'Plan', value: planName },
    ],
    ctaLabel: 'Ir a pagar mi póliza',
    ctaUrl: paymentUrl,
    extraNote: expiresLabel ? `Válido hasta ${expiresLabel}` : undefined,
    fallbackUrl: paymentUrl,
    callCenterPhone: params.callCenterPhone,
  });
}
