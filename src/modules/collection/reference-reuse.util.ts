export const REFERENCE_REUSED_OTHER_PAYER_MESSAGE =
  'La referencia de pago ya fue utilizada en el cobro de otro asegurado.';
export const REFERENCE_REUSED_AMOUNT_EXCEEDED_MESSAGE =
  'La referencia de pago ya fue utilizada y no cubre el monto de este cobro.';

/** Cobro previo (cbreporte_pago) hecho con la misma referencia bancaria. */
export interface PriorReferenceCollection {
  casegurado: number;
  mpago: number;
}

export type ReferenceReuseResult =
  | { ok: true }
  | { ok: false; reason: 'OTHER_PAYER' | 'AMOUNT_EXCEEDED'; message: string };

const AMOUNT_TOLERANCE = 0.01;

/**
 * Decide si una referencia bancaria puede cobrar este recibo.
 * - Usada antes por otro asegurado: se rechaza.
 * - Usada antes por el mismo asegurado: lo ya cobrado + este cobro no puede superar
 *   el monto del movimiento bancario (pago_movil.monto), si se conoce.
 */
export function evaluateReferenceReuse(params: {
  ctenedor: number;
  mpago: number;
  movementAmount: number | null;
  prior: PriorReferenceCollection[];
}): ReferenceReuseResult {
  const { ctenedor, mpago, movementAmount, prior } = params;
  if (!prior.length) return { ok: true };

  if (prior.some((p) => Number(p.casegurado) !== Number(ctenedor))) {
    return { ok: false, reason: 'OTHER_PAYER', message: REFERENCE_REUSED_OTHER_PAYER_MESSAGE };
  }

  if (movementAmount != null && movementAmount > 0) {
    const alreadyCollected = prior.reduce((sum, p) => sum + Number(p.mpago ?? 0), 0);
    if (alreadyCollected + Number(mpago) > movementAmount + AMOUNT_TOLERANCE) {
      return {
        ok: false,
        reason: 'AMOUNT_EXCEEDED',
        message: REFERENCE_REUSED_AMOUNT_EXCEEDED_MESSAGE,
      };
    }
  }
  return { ok: true };
}
